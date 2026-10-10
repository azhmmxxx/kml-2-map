import type { TrackMeta, TrackSegment, TrackStats } from '../types.ts';

/** 地球平均半径（米） */
const R = 6371008.8;
const RAD = Math.PI / 180;

/** 两点球面距离（米），haversine 公式 */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLat = (lat2 - lat1) * RAD;
	const dLng = (lng2 - lng1) * RAD;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

/** 海拔平滑窗口半径（点数） */
const SMOOTH_K = 4;
/** 累计爬升/下降的单步阈值（米），抑制 GPS 噪声 */
const DELTA_THRESHOLD = 0.8;

/**
 * 累计爬升 / 下降。
 * 先做 ±SMOOTH_K 滑动均值平滑，再按阈值累计增量。
 * 注意：这是近似算法，与两步路官方统计值会有出入（PoC 经验约 ±5%）。
 */
function gainLoss(eles: number[]): { gain: number; loss: number } {
	const n = eles.length;
	if (n < 3) return { gain: 0, loss: 0 };

	const sm = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let sum = 0;
		let count = 0;
		for (let j = Math.max(0, i - SMOOTH_K); j <= Math.min(n - 1, i + SMOOTH_K); j++) {
			sum += eles[j];
			count++;
		}
		sm[i] = sum / count;
	}

	let gain = 0;
	let loss = 0;
	for (let i = 1; i < n; i++) {
		const d = sm[i] - sm[i - 1];
		if (d > DELTA_THRESHOLD) gain += d;
		else if (d < -DELTA_THRESHOLD) loss -= d;
	}
	return { gain, loss };
}

/** 全轨迹统计。起止时间优先取 KML 元数据，缺失时回退到首个/末个轨迹点时间。 */
export function computeStats(segments: TrackSegment[], meta?: TrackMeta): TrackStats {
	let distanceM = 0;
	let pointCount = 0;
	let min = Infinity;
	let max = -Infinity;
	let firstT: number | null = null;
	let lastT: number | null = null;
	const eles: number[] = [];

	for (const seg of segments) {
		const pts = seg.points;
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];
			pointCount++;
			if (i > 0) distanceM += haversine(pts[i - 1].lat, pts[i - 1].lng, p.lat, p.lng);
			if (p.ele != null && Number.isFinite(p.ele)) {
				eles.push(p.ele);
				if (p.ele < min) min = p.ele;
				if (p.ele > max) max = p.ele;
			}
			if (p.time != null) {
				if (firstT == null) firstT = p.time;
				lastT = p.time;
			}
		}
	}

	const { gain, loss } = gainLoss(eles);
	return {
		pointCount,
		distanceM,
		maxEle: max === -Infinity ? 0 : max,
		minEle: min === Infinity ? 0 : min,
		gainM: gain,
		lossM: loss,
		startTime: meta?.beginTime ?? firstT,
		endTime: meta?.endTime ?? lastT
	};
}

/** 单日行程摘要（路线信息卡「详细路线信息」展开项） */
export interface DaySegment {
	/** 当天首个 / 末个记录时间（epoch 毫秒） */
	startMs: number;
	endMs: number;
	/** 当天里程（公里，当日首点至末点的累计差） */
	km: number;
	/** 当天最高海拔（米），无海拔数据为 null */
	maxEle: number | null;
	/** 当天累计爬升 / 下降（米），无海拔数据为 0 */
	gainM: number;
	lossM: number;
}

/** 每日行程分组结果：天条目 + 每个轨迹点的日归属 */
export interface DailyGroups {
	days: DaySegment[];
	/** 与 points 下标对齐的日索引（0 起）；完全无时间数据时全为 -1 */
	pointDay: Int32Array;
}

/**
 * 按本地日历日拆分行程（路线信息卡展开显示 + 按日灰显路线）。
 * 完全没有时间数据时 days 为空、pointDay 全 -1；日边界以带时间的点起算，
 * 缺时间的点并入当前日（里程连续累计不受影响），轨迹开头无时间的前缀并入首日。
 * 爬升/下降与全轨迹统计同口径（平滑 + 阈值，见 gainLoss），按日分段计算。
 */
export function groupByDay(
	points: ReadonlyArray<{ km: number; ele: number; time: number | null }>,
	hasEle: boolean
): DailyGroups {
	const pointDay = new Int32Array(points.length).fill(-1);
	const first = points.findIndex((p) => p.time != null);
	if (first < 0) return { days: [], pointDay };

	const days: Array<DaySegment & { key: number; kmStart: number; eles: number[] }> = [];
	let cur: (typeof days)[number] | null = null;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		if (p.time != null) {
			const d = new Date(p.time);
			const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
			if (!cur || key !== cur.key) {
				// 首日把轨迹开头的无时间前缀（若有）也并入
				cur = {
					key,
					startMs: p.time,
					endMs: p.time,
					kmStart: days.length === 0 ? points[0].km : p.km,
					km: 0,
					maxEle: null,
					gainM: 0,
					lossM: 0,
					eles: []
				};
				days.push(cur);
			} else {
				cur.endMs = p.time;
			}
		}
		if (!cur) continue;
		pointDay[i] = days.length - 1;
		cur.km = p.km - cur.kmStart;
		if (hasEle) {
			cur.eles.push(p.ele);
			if (cur.maxEle == null || p.ele > cur.maxEle) cur.maxEle = p.ele;
		}
	}
	// 首个带时间点之前的点并入首日（保证整条线都有着色归属）
	for (let i = 0; i < first; i++) pointDay[i] = 0;

	return {
		days: days.map((d) => {
			const { gain, loss } = gainLoss(d.eles);
			return {
				startMs: d.startMs,
				endMs: d.endMs,
				km: d.km,
				maxEle: d.maxEle,
				gainM: hasEle ? gain : 0,
				lossM: hasEle ? loss : 0
			};
		}),
		pointDay
	};
}
