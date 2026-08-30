<script lang="ts">
	import { onMount } from 'svelte';
	import * as L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import LayerToolButton from './LayerToolButton.svelte';
	import SettingsToolButton from './SettingsToolButton.svelte';
	import IconButton from './IconButton.svelte';
	import { Eye, EyeOff } from '@lucide/svelte';
	import type { Waypoint } from '$lib/types';
	import type { PreparedTrack } from '$lib/geo/prepare';
	import { simplify } from '$lib/geo/simplify';
	import { wgs84ToGcj02 } from '$lib/geo/gcj02';
	import { ELEVATION_COLORS, type TrackStyle } from '$lib/theme';
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
	}
	let {
		prepared,
		waypoints,
		cleanMode,
		onToggleClean,
		openTool = $bindable(null),
		trackStyle = $bindable()
	}: Props = $props();

	function setOpenTool(id: string | null) {
		openTool = id;
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

	let root: HTMLDivElement;
	let map: L.Map | null = null;
	let cursor: L.CircleMarker | null = null;
	let routeGroup: L.LayerGroup | null = null;
	let hoverRAF: number | null = null;

	/** 显示投影：把 WGS-84 内部坐标映射到底图坐标系（GCJ-02 底图需前向纠偏） */
	let project: (lat: number, lng: number) => [number, number] = (lat, lng) => [lat, lng];
	/** prepared.points 的显示坐标缓存（按 下标对齐，渲染/游标/悬停共用） */
	let displayPts: Array<[number, number]> = [];
	/** 已 fit 视野的轨迹对象（图层切换重渲染时不重置视野） */
	let fitted: PreparedTrack | null = null;

	interface BaseLayer {
		label: string;
		/** TileLayer 或其组合（如高德卫星 = 影像 + 路网注记透明层） */
		layer: L.Layer;
		/** 底图坐标系：gcj02 底图上的渲染几何需先做 WGS-84 → GCJ-02 前向纠偏 */
		crs: 'wgs84' | 'gcj02';
	}

	/** 底图列表（onMount 构建；$state 驱动工具栏选项渲染） */
	let baseLayers = $state<BaseLayer[]>([]);
	let activeBase = $state(0);
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
		map.removeLayer(baseLayers[activeBase].layer);
		activeBase = i;
		baseLayers[i].layer.addTo(map);
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

		// Esri 系底图（WGS-84，与 GPS 轨迹坐标系一致，无需纠偏）
		const esri = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 17, attribution: '&copy; Esri World Imagery' }
		);
		const esriStreet = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 17, attribution: '&copy; Esri World Street Map' }
		);
		const esriTopo = L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
			{ maxZoom: 17, attribution: '&copy; Esri World Topo' }
		);
		// 高德系底图（GCJ-02、中文标注）：WGS-84 轨迹需经前向纠偏后再渲染
		const gaodeStreet = L.tileLayer(
			'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
			{ maxZoom: 18, subdomains: ['1', '2', '3', '4'], attribution: '&copy; 高德地图' }
		);
		const gaodeSat = L.layerGroup([
			// 卫星影像
			L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
				maxZoom: 18,
				subdomains: ['1', '2', '3', '4'],
				attribution: '&copy; 高德地图'
			}),
			// 路网+中文标注透明层，专为叠加卫星影像设计
			L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
				maxZoom: 18,
				subdomains: ['1', '2', '3', '4'],
				attribution: '&copy; 高德地图'
			})
		]);

		baseLayers = [
			{ label: '卫星影像(高德)', layer: gaodeSat, crs: 'gcj02' },
			{ label: '卫星影像(Esri)', layer: esri, crs: 'wgs84' },
			{ label: '街道地图(高德)', layer: gaodeStreet, crs: 'gcj02' },
			{ label: '街道地图(Esri)', layer: esriStreet, crs: 'wgs84' },
			{ label: '地形图(Esri)', layer: esriTopo, crs: 'wgs84' }
		];
		// 默认底图 = 列表第一项（含其坐标系投影）
		baseLayers[0].layer.addTo(map);
		setProjection(baseLayers[0].crs);

		const onResize = () => map?.invalidateSize();
		window.addEventListener('resize', onResize);

		return () => {
			window.removeEventListener('resize', onResize);
			if (hoverRAF != null) cancelAnimationFrame(hoverRAF);
			map?.remove();
			map = null;
		};
	});

	// 轨迹数据变化时（如路由参数切换）重建图层
	$effect(() => {
		renderTrack(prepared, waypoints);
	});

	interface Run {
		bucket: number;
		coords: Array<[number, number]>;
	}

	function bucketOf(ele: number, min: number, max: number): number {
		if (max <= min) return 0;
		return Math.min(6, Math.max(0, Math.floor(((ele - min) / (max - min)) * 7)));
	}

	/** 按段边界与海拔桶拆分为连续同色线段（坐标取显示投影后的） */
	function buildRuns(p: PreparedTrack): Run[] {
		const runs: Run[] = [];
		const segStarts = new Set(p.breaks);
		let curBucket = -1;
		let curCoords: Array<[number, number]> = [];
		const flush = () => {
			if (curCoords.length > 1) runs.push({ bucket: curBucket, coords: curCoords });
			curCoords = [];
		};
		for (let i = 0; i < p.points.length; i++) {
			if (segStarts.has(i)) {
				flush();
				curBucket = -1;
			}
			const b = p.hasEle ? bucketOf(p.points[i].ele, p.eleMin, p.eleMax) : 0;
			if (b !== curBucket) {
				flush();
				curBucket = b;
			}
			curCoords.push(displayPts[i]);
		}
		flush();
		return runs;
	}

	function renderTrack(p: PreparedTrack, wps: Waypoint[]) {
		if (!map || !p.points.length) return;
		displayPts = p.points.map((pt) => project(pt.lat, pt.lng));
		routeGroup?.remove();
		const rg = L.layerGroup().addTo(map);
		routeGroup = rg;

		const runs = buildRuns(p).map((r) => ({
			bucket: r.bucket,
			coords: r.coords.length > SIMPLIFY_THRESHOLD ? simplify(r.coords, SIMPLIFY_TOL) : r.coords
		}));

		// 底层白色描边（casing 随线宽同比加粗）
		L.polyline(
			runs.map((r) => r.coords),
			{
				color: '#ffffff',
				weight: trackStyle.weight + 2.5,
				opacity: 0.9,
				lineCap: 'round',
				lineJoin: 'round',
				interactive: false
			}
		).addTo(rg);

		// 轨迹着色（海拔分色或自定义纯色；同色合并为一个 polyline，便于 hover 事件）
		const byBucket: Array<Array<Array<[number, number]>>> = ELEVATION_COLORS.map(() => []);
		for (const r of runs) byBucket[r.bucket].push(r.coords);
		byBucket.forEach((segs, b) => {
			if (!segs.length) return;
			const layer = L.polyline(segs, {
				color: trackStyle.elevationColoring ? ELEVATION_COLORS[b] : trackStyle.solidColor,
				weight: trackStyle.weight,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(rg);
			bindRouteHover(layer);
		});

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
		// 非对称留白：顶部只避开角落控件，左侧避开统计卡，底部避开剖面面板
		if (fitted !== p) {
			const pad =
				window.innerWidth < 640
					? { paddingTopLeft: L.point(12, 240), paddingBottomRight: L.point(12, 190) }
					: { paddingTopLeft: L.point(360, 40), paddingBottomRight: L.point(60, 230) };
			map.fitBounds(L.latLngBounds(displayPts), pad);
			fitted = p;
		}
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
			/>
		{/if}
	</div>
</div>

<style>
	.map-wrap {
		position: absolute;
		inset: 0;
	}

	.map-root {
		position: absolute;
		inset: 0;
		background: #e8e4dc;
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
