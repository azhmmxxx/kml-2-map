<script lang="ts">
	import { onMount } from 'svelte';
	import * as L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import LayerToolButton from './LayerToolButton.svelte';
	import SettingsToolButton from './SettingsToolButton.svelte';
	import ExportModal from './ExportModal.svelte';
	import IconButton from './IconButton.svelte';
	import { Eye, EyeOff } from '@lucide/svelte';
	import type { Waypoint } from '$lib/types';
	import type { PreparedTrack } from '$lib/geo/prepare';
	import { simplify } from '$lib/geo/simplify';
	import { wgs84ToGcj02 } from '$lib/geo/gcj02';
	import {
		ELEVATION_COLORS,
		TRACK_DIM_COLOR,
		TRACK_DIM_OPACITY,
		type ThemeMode,
		type TrackStyle
	} from '$lib/theme';
	import {
		CARD_PAD,
		GIF_FRAME_STEPS,
		GIF_MAX_SIDE,
		MAX_CANVAS_DIM,
		type ExportOptions
	} from '$lib/exportImage';
	import { fmtDateTime } from '$lib/format';

	interface Props {
		prepared: PreparedTrack;
		waypoints: Waypoint[];
		/** 纯净预览模式：隐藏所有自定义覆盖层，仅保留地图本体 + 模式开关 */
		cleanMode: boolean;
		onToggleClean: () => void;
		/**
		 * 当前打开的工具面板 id（bind 双向；null = 全部收起）。
		 * 通用联动信号：页面可按 id 做「任一面板打开」的卡片让位（如图例），
		 * 也可识别具体工具做专属联动（如设置面板打开时收起剖面）。
		 * 新增工具各领一个 id 注册进来。
		 */
		openTool: string | null;
		/** 轨迹样式（bind 双向，页面持有；设置面板可改） */
		trackStyle: TrackStyle;
		/** 界面风格（bind 双向）：仅透传给设置面板，风格变化全由 CSS 变量与底图滤镜承接 */
		themeMode: ThemeMode;
		/** 导出选项（bind 双向）：设置面板可改；级别模式（zoomMode/level）在本组件消费，其余透传 */
		exportOptions: ExportOptions;
		/** 每个轨迹点所属的行程日索引（与 points 下标对齐；null = 轨迹无时间数据） */
		dayPointIdx: Int32Array | null;
		/** 每日选中态（未选中的日路线灰显；与路线信息卡的日期勾选联动） */
		selectedDays: boolean[];
		/** 触发导出图片（页面层实现：合成信息卡片并下载） */
		onExport: () => void;
	}
	let {
		prepared,
		waypoints,
		cleanMode,
		onToggleClean,
		openTool = $bindable(null),
		trackStyle = $bindable(),
		themeMode = $bindable(),
		exportOptions = $bindable(),
		dayPointIdx = null,
		selectedDays = [],
		onExport
	}: Props = $props();

	function setOpenTool(id: string | null) {
		openTool = id;
	}

	/** 导出配置弹窗开关（设置面板「导出图片」入口打开） */
	let exportOpen = $state(false);

	/** 收起工具面板并打开导出配置弹窗（配置项在弹窗内选择） */
	function openExportModal() {
		setOpenTool(null);
		exportOpen = true;
	}

	// 进入纯净模式时收起工具面板
	$effect(() => {
		if (cleanMode && openTool != null) setOpenTool(null);
	});

	/** 通过 bind:this 暴露给父组件的实例方法 */
	export function setCursorByKm(km: number) {
		const pts = prepared.points;
		let lo = 0;
		let hi = pts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (pts[mid].km < km) lo = mid + 1;
			else hi = mid;
		}
		cursor?.setLatLng(displayPts[lo]);
	}

	// 海拔配色见 $lib/theme（ELEVATION_COLORS，与图例卡共用）
	const SIMPLIFY_THRESHOLD = 2500;
	const SIMPLIFY_TOL = 1e-4; // ≈10m
	// 画布文字字体（与全局 body 一致，导出标记用）
	const FONT_STACK = "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

	let root: HTMLDivElement;
	let map: L.Map | null = null;
	let cursor: L.CircleMarker | null = null;
	let routeGroup: L.LayerGroup | null = null;
	let hoverRAF: number | null = null;
	/** 闪烁动画 rAF 句柄（null = 未运行） */
	let blinkRAF: number | null = null;
	/** 参与闪烁的线层与各自基准不透明度（每次 renderTrack 重建） */
	let blinkLayers: Array<{ layer: L.Polyline; base: number }> = [];

	/** 显示投影：把 WGS-84 内部坐标映射到底图坐标系（GCJ-02 底图需前向纠偏） */
	let project: (lat: number, lng: number) => [number, number] = (lat, lng) => [lat, lng];
	/** prepared.points 的显示坐标缓存（按 下标对齐，渲染/游标/悬停共用） */
	let displayPts: Array<[number, number]> = [];
	/** 已 fit 视野的轨迹对象（图层切换重渲染时不重置视野） */
	let fitted: PreparedTrack | null = null;

	interface BaseLayer {
		label: string;
		/** 新建图层实例（TileLayer 或其组合，如高德卫星 = 影像 + 路网注记透明层）。Leaflet 图层有状态、绑定单地图，主地图与导出离屏地图各建一份 */
		build: () => L.Layer;
		/** 底图坐标系：gcj02 底图上的渲染几何需先做 WGS-84 → GCJ-02 前向纠偏 */
		crs: 'wgs84' | 'gcj02';
	}

	// Esri 系（WGS-84，与 GPS 轨迹坐标系一致，无需纠偏）；高德系（GCJ-02、中文标注）。
	// 全部开 crossOrigin：导出需把瓦片绘入画布（图源均允许 CORS）。
	// 街道/地形类带 tile-filterable：由各风格的 CSS 滤镜处理（见 app.css）；卫星影像不参与（反色失真）
	const baseLayerDefs = (): BaseLayer[] => [
		{
			label: '卫星影像(高德)',
			crs: 'gcj02',
			build: () =>
				L.layerGroup([
					// 卫星影像
					L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
						maxZoom: 18,
						subdomains: ['1', '2', '3', '4'],
						attribution: '&copy; 高德地图',
						crossOrigin: true
					}),
					// 路网+中文标注透明层，专为叠加卫星影像设计
					L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
						maxZoom: 18,
						subdomains: ['1', '2', '3', '4'],
						attribution: '&copy; 高德地图',
						crossOrigin: true
					})
				])
		},
		{
			label: '卫星影像(Esri)',
			crs: 'wgs84',
			build: () =>
				L.tileLayer(
					'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
					{ maxZoom: 17, attribution: '&copy; Esri World Imagery', crossOrigin: true }
				)
		},
		{
			label: '街道地图(高德)',
			crs: 'gcj02',
			build: () =>
				L.tileLayer(
					'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
					{
						maxZoom: 18,
						subdomains: ['1', '2', '3', '4'],
						attribution: '&copy; 高德地图',
						className: 'tile-filterable',
						crossOrigin: true
					}
				)
		},
		{
			label: '街道地图(Esri)',
			crs: 'wgs84',
			build: () =>
				L.tileLayer(
					'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
					{
						maxZoom: 17,
						attribution: '&copy; Esri World Street Map',
						className: 'tile-filterable',
						crossOrigin: true
					}
				)
		},
		{
			label: '地形图(Esri)',
			crs: 'wgs84',
			build: () =>
				L.tileLayer(
					'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
					{
						maxZoom: 17,
						attribution: '&copy; Esri World Topo',
						className: 'tile-filterable',
						crossOrigin: true
					}
				)
		}
	];

	/** 底图列表（onMount 构建；$state 驱动工具栏选项渲染） */
	let baseLayers = $state<BaseLayer[]>([]);
	let activeBase = $state(0);
	/** 当前挂在主地图上的底图实例（defs 每次构建新实例） */
	let activeLayer: L.Layer | null = null;
	/** 当前视野缩放级（设置面板估算导出尺寸 / 自定义级别初值用；zoomend 同步） */
	let viewZoom = $state(0);
	const baseOptions = $derived(
		baseLayers.map((b, i) => ({ label: b.label, active: i === activeBase }))
	);

	function setProjection(crs: BaseLayer['crs']) {
		project =
			crs === 'gcj02'
				? (lat, lng) => {
						const [gLng, gLat] = wgs84ToGcj02(lng, lat);
						return [gLat, gLng];
					}
				: (lat, lng) => [lat, lng];
	}

	function selectBase(i: number) {
		if (i === activeBase || !map) return;
		activeLayer?.remove();
		activeBase = i;
		activeLayer = baseLayers[i].build().addTo(map);
		setProjection(baseLayers[i].crs);
		renderTrack(prepared, waypoints);
	}

	onMount(() => {
		// zoomSnap/zoomDelta 0.5：±按钮与滚轮按半级缩放（每次约 1.41 倍，步长更细腻）
		map = L.map(root, {
			preferCanvas: true,
			zoomControl: false,
			minZoom: 4,
			zoomSnap: 0.5,
			zoomDelta: 0.5
		});
		L.control.zoom({ position: 'bottomright' }).addTo(map);
		L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
		viewZoom = map.getZoom();
		map.on('zoomend', () => (viewZoom = map?.getZoom() ?? viewZoom));

		baseLayers = baseLayerDefs();
		// 默认底图 = 列表第一项（含其坐标系投影）
		activeLayer = baseLayers[0].build().addTo(map);
		setProjection(baseLayers[0].crs);

		const onResize = () => map?.invalidateSize();
		window.addEventListener('resize', onResize);

		return () => {
			window.removeEventListener('resize', onResize);
			if (hoverRAF != null) cancelAnimationFrame(hoverRAF);
			stopBlink();
			map?.remove();
			map = null;
		};
	});

	// 轨迹数据变化时（如路由参数切换）重建图层
	$effect(() => {
		renderTrack(prepared, waypoints);
	});

	/** 路线 WGS-84 包围盒（SW/NE 经纬度），设置面板估算级别导出尺寸用（GCJ 纠偏量 <1km，估算可忽略） */
	const routeBounds = $derived.by(() => {
		let s = 90;
		let w = 180;
		let n = -90;
		let e = -180;
		for (const p of prepared.points) {
			if (p.lat < s) s = p.lat;
			if (p.lat > n) n = p.lat;
			if (p.lng < w) w = p.lng;
			if (p.lng > e) e = p.lng;
		}
		return prepared.points.length
			? ([
					[s, w],
					[n, e]
				] as [[number, number], [number, number]])
			: null;
	});

	interface Run {
		bucket: number;
		/** 所属日期未选中（灰显段） */
		dim: boolean;
		coords: Array<[number, number]>;
	}

	function bucketOf(ele: number, min: number, max: number): number {
		if (max <= min) return 0;
		return Math.min(6, Math.max(0, Math.floor(((ele - min) / (max - min)) * 7)));
	}

	/** 按段边界 / 海拔桶 / 日期选中态拆分为连续同渲染线段（坐标取显示投影后的） */
	function buildRuns(p: PreparedTrack): Run[] {
		const runs: Run[] = [];
		const segStarts = new Set(p.breaks);
		const pd = dayPointIdx;
		let curBucket = -1;
		let curDim = false;
		let curCoords: Array<[number, number]> = [];
		const flush = () => {
			if (curCoords.length > 1) runs.push({ bucket: curBucket, dim: curDim, coords: curCoords });
			curCoords = [];
		};
		for (let i = 0; i < p.points.length; i++) {
			const b = p.hasEle ? bucketOf(p.points[i].ele, p.eleMin, p.eleMax) : 0;
			const dim = !!(pd && selectedDays[pd[i]] === false);
			if (segStarts.has(i) || b !== curBucket || dim !== curDim) {
				flush();
				curBucket = b;
				curDim = dim;
			}
			curCoords.push(displayPts[i]);
		}
		flush();
		return runs;
	}

	/** buildRuns + 大数据抽稀（屏幕渲染与导出共用同一条轨迹线数据） */
	function computeRuns(p: PreparedTrack) {
		return buildRuns(p).map((r) => ({
			bucket: r.bucket,
			dim: r.dim,
			coords: r.coords.length > SIMPLIFY_THRESHOLD ? simplify(r.coords, SIMPLIFY_TOL) : r.coords
		}));
	}

	function renderTrack(p: PreparedTrack, wps: Waypoint[]) {
		if (!map || !p.points.length) return;
		displayPts = p.points.map((pt) => project(pt.lat, pt.lng));
		routeGroup?.remove();
		const rg = L.layerGroup().addTo(map);
		routeGroup = rg;
		stopBlink(); // 旧线层的闪烁循环停止（图层已移除）

		const runs = computeRuns(p);
		// 未选中日期段（灰显）：描边与灰线恒定弱化，不随「不透明度」设置
		const dimSegs = runs.filter((r) => r.dim).map((r) => r.coords);
		const litSegs = runs.filter((r) => !r.dim).map((r) => r.coords);

		// 参与闪烁动画的线层与基准不透明度（仅选中段：描边 + 着色；灰显段 / 标记 / 游标不参与）
		const blink: Array<{ layer: L.Polyline; base: number }> = [];
		/** 建线并登记闪烁基准不透明度 */
		const addLine = (
			coords: Array<Array<[number, number]>>,
			opts: L.PolylineOptions,
			base: number
		) => {
			const layer = L.polyline(coords, opts).addTo(rg);
			blink.push({ layer, base });
			return layer;
		};

		// 底层白色描边（casing 随线宽同比加粗）：选中段随轨迹不透明度，未选中段恒 30%
		addLine(
			litSegs,
			{
				color: '#ffffff',
				weight: trackStyle.weight + 2.5,
				opacity: trackStyle.opacity * 0.95,
				lineCap: 'round',
				lineJoin: 'round',
				interactive: false
			},
			trackStyle.opacity * 0.95
		);
		// 未选中段描边：不参与闪烁，保持恒定弱化
		L.polyline(dimSegs, {
			color: '#ffffff',
			weight: trackStyle.weight + 2.5,
			opacity: TRACK_DIM_OPACITY * 0.95,
			lineCap: 'round',
			lineJoin: 'round',
			interactive: false
		}).addTo(rg);

		// 未选中日期：整段灰显（纯色/海拔分色模式都生效），与着色层同级同宽；不参与闪烁
		if (dimSegs.length) {
			bindRouteHover(
				L.polyline(dimSegs, {
					color: TRACK_DIM_COLOR,
					weight: trackStyle.weight,
					opacity: TRACK_DIM_OPACITY,
					lineCap: 'round',
					lineJoin: 'round'
				}).addTo(rg)
			);
		}

		// 轨迹着色（海拔分色或自定义纯色；同色合并为一个 polyline，便于 hover 事件）
		const byBucket: Array<Array<Array<[number, number]>>> = ELEVATION_COLORS.map(() => []);
		for (const r of runs) if (!r.dim) byBucket[r.bucket].push(r.coords);
		byBucket.forEach((segs, b) => {
			if (!segs.length) return;
			bindRouteHover(
				addLine(
					segs,
					{
						color: trackStyle.elevationColoring ? ELEVATION_COLORS[b] : trackStyle.solidColor,
						weight: trackStyle.weight,
						opacity: trackStyle.opacity,
						lineCap: 'round',
						lineJoin: 'round'
					},
					trackStyle.opacity
				)
			);
		});

		// 闪烁动画：仅选中段呼吸（灰显段保持灰色、标记不参与）；导出走 drawRouteOverlay 静态绘制，不受影响
		blinkLayers = blink;
		if (trackStyle.animation === 'blink') startBlink();

		// 联动游标
		cursor = L.circleMarker(displayPts[0], {
			radius: 8,
			color: '#fff',
			weight: 3,
			fillColor: '#e8590c',
			fillOpacity: 1
		})
			.bindTooltip('', { direction: 'top', offset: [0, -6], className: 'wp-label' })
			.addTo(rg);

		renderWaypoints(wps, rg);

		// 仅新轨迹 fit 视野；图层切换（重投影重渲染）保持当前视野。
		// 非对称留白与级别导出共用 CARD_PAD（见 exportImage）：左侧避开统计卡、底部避开剖面面板
		if (fitted !== p) {
			const pad =
				window.innerWidth < 640
					? { paddingTopLeft: L.point(12, 240), paddingBottomRight: L.point(12, 190) }
					: {
							paddingTopLeft: L.point(CARD_PAD.left, CARD_PAD.top),
							paddingBottomRight: L.point(CARD_PAD.right, CARD_PAD.bottom)
						};
			map.fitBounds(L.latLngBounds(displayPts), pad);
			fitted = p;
		}
	}

	/** 闪烁动画：选中段透明度正弦呼吸（周期约 1.6s，最低降到基准的 15%）。已在运行则不重复启动 */
	function startBlink() {
		if (blinkRAF != null) return;
		const t0 = performance.now();
		const tick = (t: number) => {
			const f = blinkFactor((t - t0) / 1600);
			for (const { layer, base } of blinkLayers) layer.setStyle({ opacity: base * f });
			blinkRAF = requestAnimationFrame(tick);
		};
		blinkRAF = requestAnimationFrame(tick);
	}

	/** 停止闪烁并恢复各线层基准不透明度（图层重建 / 切回「无」/ 组件销毁时调用） */
	function stopBlink() {
		if (blinkRAF != null) cancelAnimationFrame(blinkRAF);
		blinkRAF = null;
		for (const { layer, base } of blinkLayers) layer.setStyle({ opacity: base });
		blinkLayers = [];
	}

	function renderWaypoints(wps: Waypoint[], rg: L.LayerGroup) {
		for (const w of wps) {
			const isEndpoint = w.id === 'startPoint' || w.id === 'endPoint';
			if (isEndpoint ? !trackStyle.showEndpoints : !trackStyle.showWaypoints) continue;
			const pos = project(w.lat, w.lng);
			const popup =
				`<b>${esc(w.name)}</b>` +
				(w.ele != null ? `<br>海拔 ${Math.round(w.ele)} m` : '') +
				(w.time != null ? `<br>${esc(fmtDateTime(w.time))}` : '');
			if (isEndpoint) {
				const start = w.id === 'startPoint';
				L.marker(pos, {
					icon: pinIcon(start ? '#2f9e44' : '#e03131', start ? '起' : '终')
				})
					.addTo(rg)
					.bindPopup(popup);
			} else {
				L.marker(pos, {
					icon: L.divIcon({
						className: '',
						html: `<div class="wp-label">📍 ${esc(w.name)}</div>`,
						iconSize: undefined,
						iconAnchor: [0, 10]
					})
				})
					.addTo(rg)
					.bindPopup(popup);
			}
		}
	}

	function pinIcon(color: string, ch: string): L.DivIcon {
		return L.divIcon({
			className: '',
			html: `<div class="pin" style="background:${color}"><span>${ch}</span></div>`,
			iconSize: [26, 26],
			iconAnchor: [13, 26]
		});
	}

	function esc(s: string): string {
		return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	}

	/**
	 * 导出用：按设置渲染地图画布（底图 + 轨迹 + 标记，不含 UI 卡片，由 lib/exportImage 在其上合成）。
	 * view 模式 = 当前视野 2 倍高清；level 模式 = 指定缩放级、画布尺寸贴合路线包围盒
	 * （离屏地图按需加载目标级瓦片后绘制，路线保证完整入画且细节更丰富）。
	 * 底图容器上的风格滤镜（CSS filter）直接复用为 ctx.filter——与屏幕所见一致
	 * （Safari < 18 不支持时退化为明亮底图）。瓦片层已开 crossOrigin 且图源均允许 CORS；仍做污染探测以便友好报错。
	 */
	export async function renderMapCanvas(): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
		if (!map) throw new Error('地图尚未初始化');
		if (exportOptions.zoomMode === 'level' && exportOptions.level >= 0)
			return renderLevelCanvas(exportOptions.level);
		return renderViewportCanvas();
	}

	/**
	 * GIF 导出：生成一个呼吸周期的帧序列（选中段按屏幕闪烁曲线逐帧变化，未选中段灰显恒定，
	 * 标记不参与）。级别模式下必须在离屏地图存活期内产帧（回调注入 renderLevelCanvas）；
	 * 帧长边超 GIF_MAX_SIDE 时等比缩小控制体积。
	 */
	export async function renderMapGifFrames(): Promise<{
		frames: HTMLCanvasElement[];
		/** 帧的 CSS 像素倍率（= 地图倍率 × GIF 缩放系数，卡片按 CSS 像素定位用） */
		scale: number;
	}> {
		if (!map) throw new Error('地图尚未初始化');
		let frames: HTMLCanvasElement[] = [];
		let effScale = 1;
		const onBase = (base: HTMLCanvasElement, m: L.Map, S: number) => {
			frames = gifFramesFromBase(base, m, S);
			effScale = S * (frames[0].width / base.width);
		};
		if (exportOptions.zoomMode === 'level' && exportOptions.level >= 0)
			await renderLevelCanvas(exportOptions.level, onBase);
		else renderViewportCanvas(onBase);
		if (!frames.length) throw new Error('导出失败：没有生成动画帧');
		return { frames, scale: effScale };
	}

	/** 呼吸系数（屏幕闪烁与 GIF 帧序列共用同一曲线）：t ∈ [0,1) 周期内 → 0.15 – 1 */
	function blinkFactor(t: number): number {
		return 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
	}

	/** GIF 帧序列：无轨迹底图 + 按呼吸系数绘制的选中段（复用一张全尺寸草稿画布，逐帧缩放后留存） */
	function gifFramesFromBase(base: HTMLCanvasElement, m: L.Map, S: number): HTMLCanvasElement[] {
		const k = Math.min(1, GIF_MAX_SIDE / Math.max(base.width, base.height));
		const fw = Math.max(1, Math.round(base.width * k));
		const fh = Math.max(1, Math.round(base.height * k));
		const scratch = document.createElement('canvas');
		scratch.width = base.width;
		scratch.height = base.height;
		const sctx = scratch.getContext('2d');
		if (!sctx) throw new Error('当前浏览器不支持画布导出');
		const frames: HTMLCanvasElement[] = [];
		for (let i = 0; i < GIF_FRAME_STEPS; i++) {
			sctx.clearRect(0, 0, scratch.width, scratch.height);
			sctx.drawImage(base, 0, 0);
			drawRouteOverlay(sctx, m, S, blinkFactor(i / GIF_FRAME_STEPS));
			const f = document.createElement('canvas');
			f.width = fw;
			f.height = fh;
			f.getContext('2d')?.drawImage(scratch, 0, 0, fw, fh);
			frames.push(f);
		}
		return frames;
	}

	/** 当前视野导出（2 倍高清，与屏幕所见一致）；onBase 提供 = 只产出无轨迹底图，交回调生成 GIF 帧 */
	function renderViewportCanvas(onBase?: (base: HTMLCanvasElement, m: L.Map, S: number) => void): {
		canvas: HTMLCanvasElement;
		scale: number;
	} {
		const S = 2;
		const rect = map!.getContainer().getBoundingClientRect();
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(rect.width * S);
		canvas.height = Math.round(rect.height * S);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('当前浏览器不支持画布导出');
		drawTilesTo(ctx, map!, rect, S);
		probeTaint(ctx);
		if (onBase) onBase(canvas, map!, S);
		else drawRouteOverlay(ctx, map!, S);
		return { canvas, scale: S };
	}

	/**
	 * 指定级别导出：画布 = 路线显示坐标包围盒在目标级的像素跨度 + 卡片留白（路线完整入画，
	 * 留白避开信息卡片），尺寸超出画布上限时自动降级。瓦片通过挂在主题树内的离屏地图
	 * 按需加载（复用同一底图定义，风格滤镜照常生效）。1 倍绘制：瓦片原生分辨率即目标级细节。
	 */
	async function renderLevelCanvas(
		zoomReq: number,
		onBase?: (base: HTMLCanvasElement, m: L.Map, S: number) => void
	): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
		if (!displayPts.length) throw new Error('暂无可导出的轨迹');
		const b = L.latLngBounds(displayPts);
		let z = Math.round(zoomReq);
		let w = 0;
		let h = 0;
		for (;;) {
			const size = boundsPixelSize(b, z);
			w = size.w + CARD_PAD.left + CARD_PAD.right;
			h = size.h + CARD_PAD.top + CARD_PAD.bottom;
			if ((w <= MAX_CANVAS_DIM && h <= MAX_CANVAS_DIM) || z <= 4) break;
			z--; // 超出画布上限：降级到路线能容纳的最高级别
		}
		// 平移地图中心，使路线 NW 角落在 (left, top) 留白处
		const nw = map!.project(b.getNorthWest(), z);
		const center = map!.unproject(
			L.point(nw.x + w / 2 - CARD_PAD.left, nw.y + h / 2 - CARD_PAD.top),
			z
		);

		// 离屏地图挂在主题树内（.map-wrap 下，屏幕外定位）：tile-filterable 滤镜与主题变量直接生效
		const holder = document.createElement('div');
		holder.style.cssText = `position:absolute;left:-100000px;top:0;width:${w}px;height:${h}px;`;
		root.parentElement?.appendChild(holder);
		const offMap = L.map(holder, {
			zoomControl: false,
			attributionControl: false,
			minZoom: 4,
			zoomSnap: 1
		});
		const offLayer = baseLayers[activeBase].build();
		offLayer.addTo(offMap);
		offMap.setView(center, z);
		try {
			await waitForTiles(offLayer);
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('当前浏览器不支持画布导出');
			// 底色兜底：瓦片缺失 / 世界边缘留白处
			ctx.fillStyle = getComputedStyle(root).getPropertyValue('--map-bg').trim() || '#e8e4dc';
			ctx.fillRect(0, 0, w, h);
			drawTilesTo(ctx, offMap, holder.getBoundingClientRect(), 1);
			probeTaint(ctx);
			// GIF：在离屏地图存活期内生成各帧（回调内完成，不往底图上画轨迹）
			if (onBase) onBase(canvas, offMap, 1);
			else drawRouteOverlay(ctx, offMap, 1);
			return { canvas, scale: 1 };
		} finally {
			offMap.remove();
			holder.remove();
		}
	}

	/** 包围盒在某级别下的像素跨度 */
	function boundsPixelSize(b: L.LatLngBounds, z: number): { w: number; h: number } {
		const nw = map!.project(b.getNorthWest(), z);
		const se = map!.project(b.getSouthEast(), z);
		return { w: Math.round(se.x - nw.x), h: Math.round(se.y - nw.y) };
	}

	/** 底图：按图层容器顺序绘制（高德卫星 = 先影像后路网标注），复用容器上的风格滤镜 */
	function drawTilesTo(
		ctx: CanvasRenderingContext2D,
		m: L.Map,
		originRect: DOMRect,
		S: number
	): void {
		const layerEls = m.getPane('tilePane')?.querySelectorAll<HTMLElement>('.leaflet-layer') ?? [];
		for (const layerEl of layerEls) {
			const filter = getComputedStyle(layerEl).filter;
			if (filter && filter !== 'none') ctx.filter = filter;
			for (const t of layerEl.querySelectorAll<HTMLImageElement>('img.leaflet-tile')) {
				const r = t.getBoundingClientRect();
				if (!r.width) continue;
				ctx.drawImage(
					t,
					Math.round((r.left - originRect.left) * S),
					Math.round((r.top - originRect.top) * S),
					Math.round(r.width * S),
					Math.round(r.height * S)
				);
			}
			ctx.filter = 'none';
		}
	}

	/** 画布污染探测：图源未允许 CORS 时给出友好报错 */
	function probeTaint(ctx: CanvasRenderingContext2D): void {
		try {
			ctx.getImageData(0, 0, 1, 1);
		} catch {
			throw new Error('当前底图瓦片不允许跨域导出，请更换底图后重试');
		}
	}

	/** 等待（组合）图层当前视野瓦片加载完成；超时则按已加载的部分继续 */
	function waitForTiles(layer: L.Layer, ms = 12000): Promise<void> {
		const layers = layer instanceof L.LayerGroup ? layer.getLayers() : [layer];
		return new Promise((resolve) => {
			let pending = layers.length;
			let done = false;
			const finish = () => {
				if (!done) {
					done = true;
					resolve();
				}
			};
			for (const l of layers)
				(l as L.TileLayer).once('load', () => {
					if (--pending <= 0) finish();
				});
			setTimeout(finish, ms);
		});
	}

	/**
	 * 轨迹：白色描边 + 分色着色 + 标记（与 renderTrack/renderWaypoints 同一数据源、层级与可见性规则）。
	 * blink = 选中段呼吸系数（屏幕闪烁与 GIF 逐帧共用同一曲线），默认 1 = 静态；未选中段恒定不参与。
	 */
	function drawRouteOverlay(ctx: CanvasRenderingContext2D, m: L.Map, S: number, blink = 1): void {
		const px = (ll: [number, number]): [number, number] => {
			const c = m.latLngToContainerPoint([ll[0], ll[1]]);
			return [c.x * S, c.y * S];
		};
		const runs = computeRuns(prepared).map((r) => ({
			bucket: r.bucket,
			dim: r.dim,
			pts: r.coords.map(px)
		}));
		const strokeAll = (polys: [number, number][][]) => {
			for (const pts of polys) {
				ctx.beginPath();
				ctx.moveTo(pts[0][0], pts[0][1]);
				for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
				ctx.stroke();
			}
		};
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		// 未选中日期段（灰显，与屏幕渲染同规则）：恒定弱化，不随「不透明度」设置
		const dimRuns = runs.filter((r) => r.dim).map((r) => r.pts);
		const litRuns = runs.filter((r) => !r.dim).map((r) => r.pts);
		// 白色描边：选中段随轨迹透明度同比减淡（GIF 按帧乘呼吸系数），未选中段恒 30%
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = (trackStyle.weight + 2.5) * S;
		ctx.globalAlpha = trackStyle.opacity * 0.95 * blink;
		strokeAll(litRuns);
		ctx.globalAlpha = TRACK_DIM_OPACITY * 0.95;
		strokeAll(dimRuns);
		// 未选中段灰线
		if (dimRuns.length) {
			ctx.globalAlpha = TRACK_DIM_OPACITY;
			ctx.strokeStyle = TRACK_DIM_COLOR;
			ctx.lineWidth = trackStyle.weight * S;
			strokeAll(dimRuns);
		}
		// 选中段着色（海拔分色或纯色）
		ctx.globalAlpha = trackStyle.opacity * blink;
		for (let b = 0; b < ELEVATION_COLORS.length; b++) {
			const polys = runs.filter((r) => r.bucket === b && !r.dim).map((r) => r.pts);
			if (!polys.length) continue;
			ctx.strokeStyle = trackStyle.elevationColoring ? ELEVATION_COLORS[b] : trackStyle.solidColor;
			ctx.lineWidth = trackStyle.weight * S;
			strokeAll(polys);
		}
		ctx.globalAlpha = 1; // 标记不随轨迹透明度

		// 标记：起止点与途径点
		for (const w of waypoints) {
			const isEndpoint = w.id === 'startPoint' || w.id === 'endPoint';
			if (isEndpoint ? !trackStyle.showEndpoints : !trackStyle.showWaypoints) continue;
			const [x, y] = px(project(w.lat, w.lng));
			if (isEndpoint) {
				const start = w.id === 'startPoint';
				drawPin(ctx, x, y, start ? '#2f9e44' : '#e03131', start ? '起' : '终', S);
			} else {
				drawWpLabel(ctx, x, y, w.name, S);
			}
		}
	}

	/** 水滴 pin（尾三角 + 圆头 + 白描边），与 divIcon 版视觉一致，锚点在尖端 */
	function drawPin(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		color: string,
		ch: string,
		s: number
	) {
		ctx.save();
		ctx.lineWidth = 2 * s;
		ctx.strokeStyle = '#fff';
		ctx.beginPath();
		ctx.moveTo(x - 8.5 * s, y - 10 * s);
		ctx.lineTo(x, y);
		ctx.lineTo(x + 8.5 * s, y - 10 * s);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(x, y - 13 * s, 10.5 * s, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#fff';
		ctx.font = `700 ${12 * s}px ${FONT_STACK}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(ch, x, y - 13 * s);
		ctx.restore();
	}

	/** 途径点标签（深色圆角底 + 白字），与 wp-label 视觉一致，锚点同 iconAnchor [0,10] */
	function drawWpLabel(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		name: string,
		s: number
	) {
		const text = `📍 ${name}`;
		ctx.save();
		ctx.font = `${11 * s}px ${FONT_STACK}`;
		const h = 20 * s;
		const w = ctx.measureText(text).width + 16 * s;
		const ry = y - 10 * s;
		ctx.beginPath();
		ctx.roundRect(x, ry, w, h, 6 * s);
		ctx.fillStyle = 'rgba(38, 34, 28, 0.85)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
		ctx.lineWidth = s;
		ctx.stroke();
		ctx.fillStyle = '#fff';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, x + 8 * s, ry + h / 2);
		ctx.restore();
	}

	// ---- 路线悬停 → 最近点游标（rAF 节流，与 PoC 一致） ----
	function bindRouteHover(layer: L.Polyline) {
		layer.on('mousemove', (e: L.LeafletMouseEvent) => {
			if (hoverRAF != null) return;
			hoverRAF = requestAnimationFrame(() => {
				hoverRAF = null;
				// 最近点搜索在显示坐标系下进行（与鼠标 latlng 同空间）
				const disp = displayPts;
				let best = 0;
				let bd = Infinity;
				for (let i = 0; i < disp.length; i += 3) {
					const dx = disp[i][1] - e.latlng.lng;
					const dy = disp[i][0] - e.latlng.lat;
					const d = dx * dx + dy * dy;
					if (d < bd) {
						bd = d;
						best = i;
					}
				}
				const info = prepared.points[best];
				cursor?.setLatLng(disp[best]);
				cursor
					?.setTooltipContent(`${Math.round(info.km)} km · 海拔 ${Math.round(info.ele)} m`)
					.openTooltip();
			});
		});
		layer.on('mouseout', () => cursor?.closeTooltip());
	}
</script>

<div class="map-wrap">
	<div class="map-root" bind:this={root}></div>
	<div class="map-toolbar">
		<!-- 模式开关在上；功能工具按钮竖排在下，面板各自向左展开。纯净模式下仅保留模式开关 -->
		<IconButton label={cleanMode ? '退出纯净预览' : '纯净预览'} onclick={onToggleClean}>
			{#if cleanMode}
				<Eye size={22} />
			{:else}
				<EyeOff size={22} />
			{/if}
		</IconButton>
		{#if !cleanMode}
			<LayerToolButton
				options={baseOptions}
				onselect={selectBase}
				open={openTool === 'layers'}
				onopenchange={(o) => setOpenTool(o ? 'layers' : null)}
			/>
			<SettingsToolButton
				open={openTool === 'settings'}
				onopenchange={(o) => setOpenTool(o ? 'settings' : null)}
				bind:trackStyle
				bind:themeMode
				bind:exportOptions
				onexport={openExportModal}
			/>
		{/if}
	</div>

	<!-- 导出配置模态窗：确认后执行导出（页面 handleExport） -->
	<ExportModal
		open={exportOpen}
		onopenchange={(o) => (exportOpen = o)}
		bind:exportOptions
		{routeBounds}
		{viewZoom}
		onexport={onExport}
	/>
</div>

<style>
	.map-wrap {
		position: absolute;
		inset: 0;
	}

	.map-root {
		position: absolute;
		inset: 0;
		background: var(--map-bg);
	}

	.map-toolbar {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 1001;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		/* 容器不挡地图交互，按钮/面板实体捕获点击 */
		pointer-events: none;
	}

	.map-toolbar > :global(*) {
		pointer-events: auto;
	}
</style>
