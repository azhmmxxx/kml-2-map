<script lang="ts">
	import { onMount } from 'svelte';
	import * as L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import type { Waypoint } from '$lib/types';
	import type { PreparedTrack } from '$lib/geo/prepare';
	import { simplify } from '$lib/geo/simplify';
	import { fmtDateTime } from '$lib/format';

	interface Props {
		prepared: PreparedTrack;
		waypoints: Waypoint[];
	}
	let { prepared, waypoints }: Props = $props();

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
		cursor?.setLatLng([pts[lo].lat, pts[lo].lng]);
	}

	// 海拔配色（低 → 高，与 PoC 一致）
	const COLORS = ['#00b09b', '#8bc34a', '#f9d423', '#ffa726', '#ff5252', '#d500f9', '#651fff'];
	const SIMPLIFY_THRESHOLD = 2500;
	const SIMPLIFY_TOL = 1e-4; // ≈10m

	let root: HTMLDivElement;
	let map: L.Map | null = null;
	let cursor: L.CircleMarker | null = null;
	let routeGroup: L.LayerGroup | null = null;
	let hoverRAF: number | null = null;

	onMount(() => {
		map = L.map(root, { preferCanvas: true, zoomControl: false, minZoom: 4 });
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
		L.control
			.layers({ 卫星影像: esri, 街道地图: esriStreet, 地形图: esriTopo }, undefined, {
				position: 'topright'
			})
			.addTo(map);
		esri.addTo(map);

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

	/** 按段边界与海拔桶拆分为连续同色线段 */
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
			const pt = p.points[i];
			const b = p.hasEle ? bucketOf(pt.ele, p.eleMin, p.eleMax) : 0;
			if (b !== curBucket) {
				flush();
				curBucket = b;
			}
			curCoords.push([pt.lat, pt.lng]);
		}
		flush();
		return runs;
	}

	function renderTrack(p: PreparedTrack, wps: Waypoint[]) {
		if (!map || !p.points.length) return;
		routeGroup?.remove();
		const rg = L.layerGroup().addTo(map);
		routeGroup = rg;

		const runs = buildRuns(p).map((r) => ({
			bucket: r.bucket,
			coords: r.coords.length > SIMPLIFY_THRESHOLD ? simplify(r.coords, SIMPLIFY_TOL) : r.coords
		}));

		// 底层白色描边
		L.polyline(
			runs.map((r) => r.coords),
			{
				color: '#ffffff',
				weight: 6,
				opacity: 0.9,
				lineCap: 'round',
				lineJoin: 'round',
				interactive: false
			}
		).addTo(rg);

		// 按海拔分色的路线（同色合并为一个 polyline，便于 hover 事件）
		const byBucket: Array<Array<Array<[number, number]>>> = COLORS.map(() => []);
		for (const r of runs) byBucket[r.bucket].push(r.coords);
		byBucket.forEach((segs, b) => {
			if (!segs.length) return;
			const layer = L.polyline(segs, {
				color: COLORS[b],
				weight: 3.5,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(rg);
			bindRouteHover(layer);
		});

		// 联动游标
		cursor = L.circleMarker([p.points[0].lat, p.points[0].lng], {
			radius: 8,
			color: '#fff',
			weight: 3,
			fillColor: '#e8590c',
			fillOpacity: 1
		})
			.bindTooltip('', { direction: 'top', offset: [0, -6], className: 'wp-label' })
			.addTo(rg);

		renderWaypoints(wps, rg);

		map.fitBounds(L.latLngBounds(p.points.map((pt) => [pt.lat, pt.lng] as [number, number])), {
			padding: [30, 240]
		});
	}

	function renderWaypoints(wps: Waypoint[], rg: L.LayerGroup) {
		for (const w of wps) {
			const popup =
				`<b>${esc(w.name)}</b>` +
				(w.ele != null ? `<br>海拔 ${Math.round(w.ele)} m` : '') +
				(w.time != null ? `<br>${esc(fmtDateTime(w.time))}` : '');
			if (w.id === 'startPoint' || w.id === 'endPoint') {
				const start = w.id === 'startPoint';
				L.marker([w.lat, w.lng], {
					icon: pinIcon(start ? '#2f9e44' : '#e03131', start ? '起' : '终')
				})
					.addTo(rg)
					.bindPopup(popup);
			} else {
				L.marker([w.lat, w.lng], {
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
				const pts = prepared.points;
				let best = 0;
				let bd = Infinity;
				for (let i = 0; i < pts.length; i += 3) {
					const dx = pts[i].lng - e.latlng.lng;
					const dy = pts[i].lat - e.latlng.lat;
					const d = dx * dx + dy * dy;
					if (d < bd) {
						bd = d;
						best = i;
					}
				}
				cursor?.setLatLng([pts[best].lat, pts[best].lng]);
				cursor
					?.setTooltipContent(
						`${Math.round(pts[best].km)} km · 海拔 ${Math.round(pts[best].ele)} m`
					)
					.openTooltip();
			});
		});
		layer.on('mouseout', () => cursor?.closeTooltip());
	}
</script>

<div class="map-root" bind:this={root}></div>

<style>
	.map-root {
		position: absolute;
		inset: 0;
		background: #e8e4dc;
	}
</style>
