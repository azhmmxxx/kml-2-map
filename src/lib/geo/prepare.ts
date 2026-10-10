import type { TrackSegment } from '../types.ts';
import { haversine } from './stats.ts';

/** 渲染用扁平轨迹点（跨段连续累计里程） */
export interface PreparedPoint {
	lat: number;
	lng: number;
	ele: number;
	/** 记录时间（epoch 毫秒），原样保留可能缺失 */
	time: number | null;
	/** 距轨迹起点的累计里程（公里，跨段连续） */
	km: number;
}

export interface PreparedTrack {
	points: PreparedPoint[];
	/** 各段的起始索引（不含 0），渲染断线用 */
	breaks: number[];
	totalKm: number;
	eleMin: number;
	eleMax: number;
	/** 是否存在有效海拔数据 */
	hasEle: boolean;
}

/**
 * 把分段轨迹扁平化为渲染友好的结构：
 * - 跨段连续累计 km（剖面图与游标联动的横轴）
 * - 海拔缺失时向前填充（着色与剖面需要连续数值）
 * - 原样保留记录时间（每日行程分组用，见 stats.dailySegments）
 */
export function prepareTrack(segments: TrackSegment[]): PreparedTrack {
	const points: PreparedPoint[] = [];
	const breaks: number[] = [];
	let km = 0;
	let lastEle: number | null = null;
	let min = Infinity;
	let max = -Infinity;

	for (const seg of segments) {
		if (points.length > 0) breaks.push(points.length);
		const pts = seg.points;
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];
			if (i > 0) km += haversine(pts[i - 1].lat, pts[i - 1].lng, p.lat, p.lng) / 1000;
			let ele = p.ele;
			if (ele == null || !Number.isFinite(ele)) ele = lastEle;
			if (ele == null) ele = 0;
			else {
				lastEle = ele;
				if (ele < min) min = ele;
				if (ele > max) max = ele;
			}
			points.push({ lat: p.lat, lng: p.lng, ele, time: p.time, km });
		}
	}

	const hasEle = min !== Infinity;
	return {
		points,
		breaks,
		totalKm: km,
		eleMin: hasEle ? min : 0,
		eleMax: hasEle ? max : 0,
		hasEle
	};
}
