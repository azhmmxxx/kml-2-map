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
