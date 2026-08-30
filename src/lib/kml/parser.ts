import { computeStats } from '../geo/stats.ts';
import type { ParsedKml, TrackMeta, TrackPoint, TrackSegment, Waypoint } from '../types.ts';

/**
 * KML 解析器（字符串扫描实现，不建 DOM）。
 *
 * 面向两步路（2bulu）导出的 TbuluKmlVersion2 格式：
 * - Document > ExtendedData：元数据（起终点名、起止时间、作者等）
 * - Folder「标注点」：Point Placemark（id: startPoint / endPoint / realPoint）
 * - Folder「轨迹片段」：每段一个 Placemark > gx:Track（gx:coord + when 成对）
 *
 * 兼容回退：无 gx:Track 时尝试 LineString > coordinates。
 * 大文件（15MB+）场景下字符串扫描比 DOMParser 快数倍且内存友好。
 */

/** <name>，兼容 CDATA 与纯文本（CDATA 结束标记与 </name> 之间可能有空白） */
const NAME_RE = /<name>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/name>/;
/** <description>，同上 */
const DESC_RE = /<description>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/description>/;
const AUTHOR_RE = /<author>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/author>/;
const COORD_RE = /<coordinates>\s*([^<]+?)\s*<\/coordinates>/;
const GX_COORD_RE = /<gx:coord>\s*([^<]+?)\s*<\/gx:coord>/g;
const WHEN_RE = /<when>([^<]+)<\/when>/g;
const DATA_RE = /<Data name="([^"]+)">\s*<value>([^<]*)<\/value>/g;

function firstText(m: RegExpMatchArray | null): string {
	if (!m) return '';
	return (m[1] ?? m[2] ?? '').trim();
}

function num(v: string | undefined): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function parseTime(s: string): number | null {
	const t = Date.parse(s.trim());
	return Number.isNaN(t) ? null : t;
}

/** 解析所有 gx:Track 轨迹段 */
function parseTrackSpans(text: string): TrackSegment[] {
	const segs: TrackSegment[] = [];
	let i = text.indexOf('<gx:Track');
	while (i !== -1) {
		const end = text.indexOf('</gx:Track>', i);
		if (end === -1) break;
		const span = text.slice(i, end);

		// 先分别收集坐标与时间戳，再按下标对齐（时间戳可能缺失或数量不齐）
		const coordStrs: string[] = [];
		let m: RegExpExecArray | null;
		GX_COORD_RE.lastIndex = 0;
		while ((m = GX_COORD_RE.exec(span))) coordStrs.push(m[1]);
		const times: Array<number | null> = [];
		WHEN_RE.lastIndex = 0;
		while ((m = WHEN_RE.exec(span))) times.push(parseTime(m[1]));

		const points: TrackPoint[] = [];
		for (let k = 0; k < coordStrs.length; k++) {
			const v = coordStrs[k].split(/\s+/);
			const lng = Number(v[0]);
			const lat = Number(v[1]);
			if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
			const ele = v.length > 2 && v[2] !== '' ? Number(v[2]) : null;
			points.push({
				lat,
				lng,
				ele: ele != null && Number.isFinite(ele) ? ele : null,
				time: k < times.length ? times[k] : null
			});
		}
		if (points.length > 1) segs.push({ points });

		i = text.indexOf('<gx:Track', end);
	}
	return segs;
}

/** 回退：解析 LineString > coordinates（"lon,lat,ele lon,lat,ele …"） */
function parseLineStrings(text: string): TrackSegment[] {
	const segs: TrackSegment[] = [];
	let i = text.indexOf('<LineString');
	while (i !== -1) {
		const end = text.indexOf('</LineString>', i);
		if (end === -1) break;
		const cm = text.slice(i, end).match(COORD_RE);
		if (cm) {
			const points: TrackPoint[] = [];
			for (const triple of cm[1].trim().split(/\s+/)) {
				const v = triple.split(',');
				const lng = Number(v[0]);
				const lat = Number(v[1]);
				if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
				const ele = v.length > 2 ? Number(v[2]) : null;
				points.push({
					lat,
					lng,
					ele: ele != null && Number.isFinite(ele) ? ele : null,
					time: null
				});
			}
			if (points.length > 1) segs.push({ points });
		}
		i = text.indexOf('<LineString', end);
	}
	return segs;
}

/** 解析标注点（含 Point 的 Placemark） */
function parseWaypoints(text: string): Waypoint[] {
	const wps: Waypoint[] = [];
	// 按未闭合的 <Placemark 切块，块内包含该 Placemark 的全部子元素
	const chunks = text.split('<Placemark').slice(1);
	for (const chunk of chunks) {
		if (!chunk.includes('<Point>')) continue;
		const cm = chunk.match(COORD_RE);
		if (!cm) continue;
		const v = cm[1]
			.trim()
			.split(',')
			.map((s) => Number(s));
		const lng = v[0];
		const lat = v[1];
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
		const ele = v.length > 2 && Number.isFinite(v[2]) ? v[2] : null;
		const idm = chunk.match(/^[^>]*\bid="([^"]*)"/);
		const wm = chunk.match(/<TimeStamp>\s*<when>([^<]+)<\/when>/);
		wps.push({
			id: idm ? idm[1] : null,
			name: firstText(chunk.match(NAME_RE)) || '未命名标注',
			lat,
			lng,
			ele,
			time: wm ? parseTime(wm[1]) : null,
			description: firstText(chunk.match(DESC_RE)) || null
		});
	}
	return wps;
}

/** 提取 Document ExtendedData 元数据 */
function parseMeta(text: string): TrackMeta {
	const map: Record<string, string> = {};
	let m: RegExpExecArray | null;
	DATA_RE.lastIndex = 0;
	while ((m = DATA_RE.exec(text))) map[m[1]] = m[2];
	return {
		author: firstText(text.match(AUTHOR_RE)) || null,
		posStartName: map['PosStartName'] ?? null,
		posEndName: map['PosEndName'] ?? null,
		beginTime: num(map['BeginTime']),
		endTime: num(map['EndTime']),
		tags: map['TrackTags'] ?? null
	};
}

/** 解析 KML 文本。fallbackName 用于 KML 内无名称时（一般取文件名）。 */
export function parseKml(text: string, fallbackName: string): ParsedKml {
	const name = firstText(text.match(NAME_RE)) || fallbackName;
	let segments = parseTrackSpans(text);
	if (segments.length === 0) segments = parseLineStrings(text);
	const waypoints = parseWaypoints(text);
	const meta = parseMeta(text);
	const stats = computeStats(segments, meta);
	return { name, meta, segments, waypoints, stats };
}
