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

/** 月日 + 周几："9月6日 周六"（每日行程条目用） */
export function dayLabel(ms: number): string {
	const d = new Date(ms);
	const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
	return `${d.getMonth() + 1}月${d.getDate()}日 ${wk}`;
}

/** 时:分："08:12" */
export function timeHM(ms: number): string {
	const d = new Date(ms);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 时长："9h28m"，不足一小时 "45m" */
export function durHM(ms: number): string {
	const m = Math.round(ms / 60000);
	const h = Math.floor(m / 60);
	return h > 0 ? `${h}h${pad(m % 60)}m` : `${m}m`;
}
