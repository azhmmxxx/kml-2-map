/** 展示格式化工具 */

function pad(n: number): string {
	return n < 10 ? '0' + n : String(n);
}

function fmt(ms: number, withTime: boolean): string {
	const d = new Date(ms);
	const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	if (!withTime) return date;
	return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(ms: number | null): string {
	return ms == null ? '' : fmt(ms, true);
}

export function fmtDate(ms: number | null): string {
	return ms == null ? '' : fmt(ms, false);
}

/** 同年省略后者年份："06-17 → 07-03"，跨年显示完整日期 */
export function dateRangeLabel(start: number | null, end: number | null): string {
	if (start == null || end == null) return '';
	const s = fmt(start, false);
	const e = fmt(end, false);
	return s.slice(0, 4) === e.slice(0, 4) ? `${s.slice(5)} → ${e.slice(5)}` : `${s} → ${e}`;
}

/** 行程天数（不足一天按一天计） */
export function durationDays(start: number | null, end: number | null): number | null {
	if (start == null || end == null || end <= start) return null;
	return Math.ceil((end - start) / 86400000);
}

/** 千分位数字，digits 位小数 */
export function fmtNum(n: number, digits = 0): string {
	return n.toLocaleString('zh-CN', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}
