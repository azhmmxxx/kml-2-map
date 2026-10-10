/**
 * 轨迹图导出：在地图画布（MapView.renderMapCanvas 产物）上合成信息卡片，输出 PNG / GIF。
 * 卡片为 canvas 手绘的简化版——与页面上卡片同布局，配色读取页面根元素上的主题变量（随风格联动）。
 * 海拔剖面图直接序列化页面上的 SVG（注入配色后转图片），与屏幕所见完全一致。
 * GIF = 选中段闪烁动画（底图帧由 MapView.renderMapGifFrames 生成），卡片绘制一次逐帧叠加后编码。
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { PreparedTrack } from './geo/prepare.ts';
import { ELEVATION_COLORS, type TrackStyle } from './theme.ts';
import type { TrackSummary } from './types.ts';
import { dateRangeLabel, durationDays, fmtNum } from './format.ts';

/** 导出内容选项（设置面板勾选；不影响屏幕显示） */
export interface ExportOptions {
	/** 导出格式：png = 静态图；gif = 选中段按屏幕闪烁动画逐帧导出（未选中段灰显恒定） */
	format: 'png' | 'gif';
	/** 海拔着色图例卡片 */
	legend: boolean;
	/** 海拔剖面卡片 */
	profile: boolean;
	/** 左上角路线信息卡片 */
	stats: boolean;
	/**
	 * 地图级别模式：view = 按当前视野导出（2 倍高清）；
	 * level = 按指定缩放级导出，画布尺寸贴合路线包围盒（保证路线完整入画且细节更丰富）
	 */
	zoomMode: 'view' | 'level';
	/** zoomMode = level 时生效的缩放级；-1 表示面板中尚未选择过 */
	level: number;
}

const FONT_STACK = `-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;

/** 剖面卡片尺寸（与页面 ElevationProfile 布局一致：头部 24 + 图表 150 + 内边距） */
const PROFILE_HEAD_H = 24;
const PROFILE_SVG_H = 150;
const PROFILE_H = 8 + PROFILE_HEAD_H + 4 + PROFILE_SVG_H + 8;

/** 级别导出时剖面卡片最大宽度：画布可能极宽，限制卡片宽度避免图表被拉伸 */
const PROFILE_MAX_W = 900;

/**
 * 视野留白（px）：避开信息卡片（左让统计卡、底让剖面）。
 * 桌面端 fitBounds 与级别导出的画布尺寸共用这一份，两种途径路线落位一致。
 */
export const CARD_PAD = { left: 360, top: 40, right: 60, bottom: 230 };

/**
 * 导出画布单边像素上限。浏览器画布上限约 16384²，但级别导出会有地图 + 合成两张画布
 * 同时驻留内存（每像素 4 字节），取 8192 控制峰值内存在可承受范围。
 */
export const MAX_CANVAS_DIM = 8192;

/** GIF 动画：一个呼吸周期的帧数与每帧时长（12 × 133ms ≈ 屏幕 1.6s 闪烁周期） */
export const GIF_FRAME_STEPS = 12;
export const GIF_FRAME_MS = 133;
/** GIF 帧长边像素上限：256 色 + 多帧体积大，超限等比缩小 */
export const GIF_MAX_SIDE = 1600;

/** Web 墨卡托：经纬度 → 缩放级 z 下的全局像素坐标（供设置面板估算导出尺寸，不依赖 Leaflet） */
function mercatorPx(lat: number, lng: number, z: number): [number, number] {
	const scale = 256 * 2 ** z;
	const x = ((lng + 180) / 360) * scale;
	const s = Math.sin((lat * Math.PI) / 180);
	const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
	return [x, y];
}

/**
 * 估算按级别导出的画布尺寸：路线 WGS-84 包围盒在目标级下的像素跨度 + 卡片留白，
 * 超出画布上限时自动降至能容纳的级别（与 MapView 实际渲染逻辑一致；估算用 WGS-84，
 * GCJ 纠偏量不足 1km，对尺寸预估可忽略）。
 */
export function estimateExportSize(
	bounds: [[number, number], [number, number]],
	zoom: number
): { level: number; w: number; h: number } {
	const [sw, ne] = bounds;
	for (let z = Math.round(zoom); ; z--) {
		const nw = mercatorPx(ne[0], sw[1], z);
		const se = mercatorPx(sw[0], ne[1], z);
		const w = Math.round(Math.abs(se[0] - nw[0])) + CARD_PAD.left + CARD_PAD.right;
		const h = Math.round(Math.abs(se[1] - nw[1])) + CARD_PAD.top + CARD_PAD.bottom;
		if ((w <= MAX_CANVAS_DIM && h <= MAX_CANVAS_DIM) || z <= 4) return { level: z, w, h };
	}
}

/** 当前风格的调色（从挂了 .theme-xxx 的元素上读 CSS 变量） */
interface Palette {
	card: string;
	ink: string;
	ink2: string;
	ink3: string;
	ink4: string;
	ink5: string;
	line: string;
	chartGrid: string;
	chartLine: string;
	chartMax: string;
}

function readPalette(el: HTMLElement): Palette {
	const cs = getComputedStyle(el);
	const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
	return {
		card: v('--card', 'rgba(255, 255, 255, 0.93)'),
		ink: v('--ink', '#26221c'),
		ink2: v('--ink-2', '#8a8378'),
		ink3: v('--ink-3', '#6b655a'),
		ink4: v('--ink-4', '#9a9384'),
		ink5: v('--ink-5', '#b5ada0'),
		line: v('--line', '#ddd6c9'),
		chartGrid: v('--chart-grid', '#e6dfd2'),
		chartLine: v('--chart-line', 'rgba(60, 55, 45, 0.5)'),
		chartMax: v('--chart-max', '#5f48c2')
	};
}

/** 卡片底：圆角 + 投影（视觉与页面 .header-card 系列一致） */
function cardBg(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	w: number,
	h: number,
	radius = 14
): void {
	ctx.save();
	ctx.shadowColor = 'rgba(30, 25, 20, 0.3)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 4;
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.fillStyle = pal.card;
	ctx.fill();
	ctx.restore();
}

/** 左上角路线信息卡（与 StatsCard 同内容同布局） */
function drawStatsCard(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	w: number,
	summary: TrackSummary
): void {
	const s = summary.stats;
	const range = dateRangeLabel(s.startTime, s.endTime);
	const days = durationDays(s.startTime, s.endTime);
	const subtitle =
		[summary.meta.author, range ? `${range}（${days} 天）` : null].filter(Boolean).join(' · ') ||
		'本地轨迹';

	const cells: Array<[string, string, string]> = [
		[fmtNum(s.distanceM / 1000, 1), 'km', '总里程'],
		[fmtNum(s.pointCount), '', '轨迹点'],
		[s.maxEle ? fmtNum(Math.round(s.maxEle)) : '-', 'm', '最高海拔'],
		[s.minEle ? fmtNum(Math.round(s.minEle)) : '-', 'm', '最低海拔'],
		[fmtNum(Math.round(s.gainM)), 'm', '累计爬升'],
		[fmtNum(Math.round(s.lossM)), 'm', '累计下降']
	];

	// 高度按页面卡片布局推算：padding 11/22、标题 21、副标题 12、统计 3 列 2 行、底部路线行
	const gridH = 29 * 2 + 10;
	const h = 11 + 21 + 11 + 12 + 12 + gridH + 12 + 10 + 14 + 11;
	cardBg(ctx, pal, x, y, w, h);
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';

	ctx.fillStyle = pal.ink;
	ctx.font = `700 21px ${FONT_STACK}`;
	ctx.fillText(summary.name, x + 22, y + 11);

	ctx.fillStyle = pal.ink2;
	ctx.font = `12px ${FONT_STACK}`;
	ctx.fillText(subtitle, x + 22, y + 11 + 21 + 11);

	const gy = y + 11 + 21 + 11 + 12 + 12;
	const colW = (w - 44) / 3;
	for (let i = 0; i < cells.length; i++) {
		const [val, unit, label] = cells[i];
		const cx = x + 22 + (i % 3) * colW;
		const cy = gy + Math.floor(i / 3) * (29 + 10);
		ctx.fillStyle = pal.ink;
		ctx.font = `700 17px ${FONT_STACK}`;
		ctx.fillText(unit ? `${val} ${unit}` : val, cx, cy);
		ctx.fillStyle = pal.ink2;
		ctx.font = `11px ${FONT_STACK}`;
		ctx.fillText(label, cx, cy + 18);
	}

	// 起终点路线行（虚线分隔）
	const ly = gy + gridH + 12;
	ctx.strokeStyle = pal.line;
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(x + 22, ly + 5);
	ctx.lineTo(x + w - 22, ly + 5);
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.font = `12px ${FONT_STACK}`;
	const from = summary.meta.posStartName ?? '起点';
	const to = summary.meta.posEndName ?? '终点';
	const mid = `— ${fmtNum(s.distanceM / 1000)} km —`;
	const ty = ly + 14;
	const dotY = ty + 6;
	const toW = ctx.measureText(to).width;
	ctx.fillStyle = pal.ink3;
	ctx.fillText(from, x + 34, ty);
	ctx.fillText(to, x + w - 22 - toW, ty);
	ctx.fillStyle = pal.ink5;
	const midW = ctx.measureText(mid).width;
	ctx.fillText(mid, x + (w - midW) / 2, ty);
	ctx.fillStyle = '#2f9e44';
	ctx.beginPath();
	ctx.arc(x + 26, dotY, 4, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#e03131';
	ctx.beginPath();
	ctx.arc(x + w - 22 - toW - 8, dotY, 4, 0, Math.PI * 2);
	ctx.fill();
}

/** 右上角海拔着色图例（与 LegendCard 同内容同布局） */
function drawLegendCard(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	prepared: PreparedTrack
): void {
	const w = 210;
	const h = 12 + 12 + 7 + 10 + 4 + 13 + 12;
	cardBg(ctx, pal, x, y, w, h, 12);
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillStyle = pal.ink;
	ctx.font = `600 12px ${FONT_STACK}`;
	ctx.fillText('海拔着色', x + 14, y + 12);

	const barY = y + 12 + 12 + 7;
	const grad = ctx.createLinearGradient(x + 14, 0, x + w - 14, 0);
	ELEVATION_COLORS.forEach((c, i) => grad.addColorStop(i / (ELEVATION_COLORS.length - 1), c));
	ctx.beginPath();
	ctx.roundRect(x + 14, barY, w - 28, 10, 5);
	ctx.fillStyle = grad;
	ctx.fill();

	const marks = [0, 1, 2, 3, 4].map((i) =>
		Math.round(prepared.eleMin + ((prepared.eleMax - prepared.eleMin) * i) / 4)
	);
	ctx.fillStyle = pal.ink2;
	ctx.font = `11px ${FONT_STACK}`;
	const sy = barY + 10 + 4;
	ctx.textAlign = 'left';
	ctx.fillText(`${marks[0]} m`, x + 14, sy);
	ctx.textAlign = 'center';
	ctx.fillText(`${marks[1]}`, x + 14 + (w - 28) * 0.25, sy);
	ctx.fillText(`${marks[2]}`, x + 14 + (w - 28) * 0.5, sy);
	ctx.fillText(`${marks[3]}`, x + 14 + (w - 28) * 0.75, sy);
	ctx.textAlign = 'right';
	ctx.fillText(`${marks[4]} m`, x + w - 14, sy);
}

/** 把剖面 SVG 克隆为可绘制的图片（注入主题配色与字体，脱离页面 scoped 样式独立渲染） */
async function svgToImage(svg: SVGSVGElement, css: string): Promise<HTMLImageElement> {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	const vb = (clone.getAttribute('viewBox') ?? '0 0 1000 150').split(/\s+/).map(Number);
	clone.setAttribute('width', String(vb[2] || 1000));
	clone.setAttribute('height', String(vb[3] || PROFILE_SVG_H));
	clone.setAttribute('style', `font-family:${FONT_STACK}`);
	const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
	styleEl.textContent = css;
	clone.insertBefore(styleEl, clone.firstChild);
	const xml = new XMLSerializer().serializeToString(clone);
	const img = new Image();
	img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
	await img.decode();
	return img;
}

/** 底部海拔剖面卡片（图表本体 = 页面上那张 SVG 的序列化图） */
async function drawProfileCard(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	x: number,
	y: number,
	w: number,
	svg: SVGSVGElement
): Promise<void> {
	cardBg(ctx, pal, x, y, w, PROFILE_H);
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillStyle = pal.ink;
	ctx.font = `600 13px ${FONT_STACK}`;
	ctx.fillText('海拔剖面', x + 16, y + 9);
	const img = await svgToImage(
		svg,
		`.ep-grid{stroke:${pal.chartGrid}}.ep-axis{fill:${pal.ink4}}.ep-line{stroke:${pal.chartLine}}.ep-max{fill:${pal.chartMax}}`
	);
	// 图表按原始纵横比等比缩放居中：级别导出的卡片宽度可能与屏幕图表不同，避免拉伸变形
	const boxW = w - 32;
	const k = Math.min(boxW / img.width, PROFILE_SVG_H / img.height);
	const dw = img.width * k;
	const dh = img.height * k;
	ctx.drawImage(
		img,
		x + 16 + (boxW - dw) / 2,
		y + 8 + PROFILE_HEAD_H + 4 + (PROFILE_SVG_H - dh) / 2,
		dw,
		dh
	);
}

/** 信息卡片的公共绘制参数（PNG 合成与 GIF 逐帧叠加共用） */
interface CardsArgs {
	/** 输出画布尺寸（设备像素） */
	width: number;
	height: number;
	/** 设备像素 → CSS 像素倍率（卡片按 CSS 像素定位与取字号） */
	scale: number;
	options: ExportOptions;
	summary: TrackSummary;
	prepared: PreparedTrack;
	trackStyle: TrackStyle;
	/** 挂了 .theme-xxx 的元素（页面根），用于读取当前风格调色 */
	themeEl: HTMLElement;
	/** 页面上的剖面 SVG（未提供则跳过剖面卡片） */
	profileSvg?: SVGSVGElement;
}

/**
 * 信息卡片覆盖层（透明底，仅卡片）：PNG 合成一次绘制；GIF 逐帧叠加也只画一次再复用
 * （剖面 SVG 序列化开销大，避免每帧重复）。
 */
async function composeCardsOverlay(args: CardsArgs): Promise<HTMLCanvasElement> {
	const { width, height, scale, options, summary, prepared, trackStyle, themeEl, profileSvg } =
		args;
	const out = document.createElement('canvas');
	out.width = width;
	out.height = height;
	const ctx = out.getContext('2d');
	if (!ctx) throw new Error('当前浏览器不支持画布导出');
	ctx.scale(scale, scale); // 之后按 CSS 像素坐标绘制
	const W = width / scale;
	const H = height / scale;
	const pal = readPalette(themeEl);

	if (options.stats) drawStatsCard(ctx, pal, 72, 16, 420, summary);
	if (options.legend && trackStyle.elevationColoring && prepared.hasEle)
		drawLegendCard(ctx, pal, W - 72 - 210, 16, prepared);
	if (options.profile && prepared.hasEle && profileSvg) {
		// 级别导出的画布可能极宽：限制剖面卡片宽度，与统计卡同起点（左 72）对齐
		const pw = Math.min(W - 144, PROFILE_MAX_W);
		await drawProfileCard(ctx, pal, 72, H - 30 - PROFILE_H, pw, profileSvg);
	}
	return out;
}

/**
 * 合成导出图：地图画布铺底，按屏幕上的布局位置叠加勾选的信息卡片。
 */
export async function composeExportImage(args: {
	mapCanvas: HTMLCanvasElement;
	/** 地图画布的放大倍数（卡片按 CSS 像素定位需要） */
	scale: number;
	options: ExportOptions;
	summary: TrackSummary;
	prepared: PreparedTrack;
	trackStyle: TrackStyle;
	/** 挂了 .theme-xxx 的元素（页面根），用于读取当前风格调色 */
	themeEl: HTMLElement;
	/** 页面上的剖面 SVG（未提供则跳过剖面卡片） */
	profileSvg?: SVGSVGElement;
}): Promise<HTMLCanvasElement> {
	const { mapCanvas } = args;
	const overlay = await composeCardsOverlay({
		width: mapCanvas.width,
		height: mapCanvas.height,
		...args
	});
	const out = document.createElement('canvas');
	out.width = mapCanvas.width;
	out.height = mapCanvas.height;
	const ctx = out.getContext('2d');
	if (!ctx) throw new Error('当前浏览器不支持画布导出');
	ctx.drawImage(mapCanvas, 0, 0);
	ctx.drawImage(overlay, 0, 0);
	return out;
}

/**
 * 编码导出 GIF：MapView 产出的底图帧（选中段已按呼吸系数逐帧变化）逐帧叠加信息卡片后编码。
 * 调色板取自首帧并全程复用（全局色表），避免逐帧重算带来的色块闪烁。
 */
export async function composeExportGif(args: {
	/** 一个呼吸周期的帧序列（已含轨迹与标记） */
	frames: HTMLCanvasElement[];
	/** 帧的 CSS 像素倍率（= 地图倍率 × GIF 缩放系数，卡片按 CSS 像素定位用） */
	scale: number;
	options: ExportOptions;
	summary: TrackSummary;
	prepared: PreparedTrack;
	trackStyle: TrackStyle;
	themeEl: HTMLElement;
	profileSvg?: SVGSVGElement;
}): Promise<Blob> {
	const { frames } = args;
	if (!frames.length) throw new Error('导出失败：没有生成动画帧');
	const overlay = await composeCardsOverlay({
		width: frames[0].width,
		height: frames[0].height,
		...args
	});
	const encoder = GIFEncoder();
	let palette: number[][] | undefined;
	for (const f of frames) {
		const ctx = f.getContext('2d');
		if (!ctx) throw new Error('当前浏览器不支持画布导出');
		ctx.drawImage(overlay, 0, 0);
		const { data, width, height } = ctx.getImageData(0, 0, f.width, f.height);
		palette ??= quantize(data, 256);
		const index = applyPalette(data, palette);
		encoder.writeFrame(index, width, height, { palette, delay: GIF_FRAME_MS });
	}
	encoder.finish();
	return new Blob([encoder.bytes()], { type: 'image/gif' });
}

/** 触发文件下载（GIF 等已有 Blob 的场景） */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 触发 PNG 下载 */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('导出失败：画布编码失败'));
				return;
			}
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			resolve();
		}, 'image/png');
	});
}
