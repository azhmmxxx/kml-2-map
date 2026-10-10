<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import MapView from '$lib/components/MapView.svelte';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StatsCard from '$lib/components/StatsCard.svelte';
	import LegendCard from '$lib/components/LegendCard.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { prepareTrack } from '$lib/geo/prepare';
	import { groupByDay } from '$lib/geo/stats';
	import { resolve } from '$app/paths';
	import {
		composeExportGif,
		composeExportImage,
		downloadBlob,
		downloadCanvasPng,
		type ExportOptions
	} from '$lib/exportImage';
	import type { AppTheme, ThemeMode, TrackStyle } from '$lib/theme';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const prepared = $derived(prepareTrack(data.data.segments));

	/** 每日行程分组（天条目 + 逐点日归属）：路线信息卡展开项与按日灰显共用 */
	const dayGroups = $derived(groupByDay(prepared.points, prepared.hasEle));
	/** 已取消选中的日（key = 轨迹id:当日首点时间，换轨迹自然失效） */
	let offDayKeys = new SvelteSet<string>();
	/** 每日选中态（默认全选；未选中的日路线在地图上灰显） */
	const selectedDays = $derived(
		dayGroups.days.map((d) => !offDayKeys.has(`${data.summary.id}:${d.startMs}`))
	);
	/** 勾选/取消某天的路线显示（路线信息卡的日期复选框） */
	function toggleDay(startMs: number, on: boolean) {
		const key = `${data.summary.id}:${startMs}`;
		if (on) offDayKeys.delete(key);
		else offDayKeys.add(key);
	}

	/** 纯净预览：隐藏所有自定义覆盖层，仅保留地图本体 + 模式开关 */
	let cleanMode = $state(false);
	/** 当前打开的工具面板 id（来自 MapView 工具栏）：图例卡与面板区域冲突，此时让位 */
	let openTool = $state<string | null>(null);
	/** 海拔剖面收起态（与剖面组件双向绑定） */
	let profileCollapsed = $state(false);
	/** 轨迹渲染样式（设置面板可调；纯色模式下海拔图例失去意义） */
	let trackStyle = $state<TrackStyle>({
		weight: 3.5,
		opacity: 0.95,
		elevationColoring: true,
		solidColor: '#e8590c',
		animation: 'none',
		showEndpoints: true,
		showWaypoints: true
	});

	/** 导出内容选项（设置面板勾选/选择，页面持有；不影响屏幕显示） */
	let exportOptions = $state<ExportOptions>({
		format: 'png',
		legend: true,
		profile: true,
		stats: true,
		zoomMode: 'view',
		level: -1
	});

	/** 界面风格（设置面板可切换），默认跟随系统 */
	let themeMode = $state<ThemeMode>('auto');

	/** 系统配色偏好（跟随系统模式下实时联动） */
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
	let systemDark = $state(prefersDark.matches);

	onMount(() => {
		const onChange = (e: MediaQueryListEvent) => (systemDark = e.matches);
		prefersDark.addEventListener('change', onChange);
		return () => prefersDark.removeEventListener('change', onChange);
	});

	/** 实际生效的主题（auto 已解析）：页面根元素挂 .theme-xxx，light 为默认值不挂类 */
	const theme = $derived<AppTheme>(
		themeMode === 'auto' ? (systemDark ? 'dark' : 'light') : themeMode
	);

	// 设置面板打开期间收起剖面；关闭后不自动恢复展开（由用户手动控制）
	$effect(() => {
		if (openTool === 'settings') profileCollapsed = true;
	});

	interface MapViewApi {
		setCursorByKm(km: number): void;
		renderMapCanvas(): Promise<{ canvas: HTMLCanvasElement; scale: number }>;
		renderMapGifFrames(): Promise<{ frames: HTMLCanvasElement[]; scale: number }>;
	}
	let mapView = $state<MapViewApi | undefined>();

	interface ElevationProfileApi {
		getSvg(): SVGSVGElement;
	}
	let profileView = $state<ElevationProfileApi | undefined>();

	let pageEl: HTMLDivElement;

	/** 导出：PNG = 地图 + 卡片静态合成；GIF = 选中段闪烁动画逐帧编码 */
	async function handleExport() {
		if (!mapView) return;
		const name = data.summary.name.replace(/[\\/:*?"<>|\s]+/g, '_') || '轨迹';
		try {
			if (exportOptions.format === 'gif') {
				const { frames, scale } = await mapView.renderMapGifFrames();
				const blob = await composeExportGif({
					frames,
					scale,
					options: exportOptions,
					summary: data.summary,
					prepared,
					trackStyle,
					themeEl: pageEl,
					profileSvg: profileView?.getSvg()
				});
				downloadBlob(blob, `${name}-轨迹地图.gif`);
			} else {
				const { canvas: mapCanvas, scale } = await mapView.renderMapCanvas();
				const out = await composeExportImage({
					mapCanvas,
					scale,
					options: exportOptions,
					summary: data.summary,
					prepared,
					trackStyle,
					themeEl: pageEl,
					profileSvg: profileView?.getSvg()
				});
				await downloadCanvasPng(out, `${name}-轨迹地图.png`);
			}
		} catch (e) {
			alert(e instanceof Error ? e.message : '导出失败');
		}
	}
</script>

<svelte:head>
	<title>{data.summary.name} · 轨迹地图</title>
</svelte:head>

<div class={`map-page theme-${theme}`} bind:this={pageEl}>
	<MapView
		bind:this={mapView}
		{prepared}
		waypoints={data.data.waypoints}
		{cleanMode}
		onToggleClean={() => (cleanMode = !cleanMode)}
		bind:openTool
		bind:trackStyle
		bind:themeMode
		bind:exportOptions
		dayPointIdx={dayGroups.pointDay}
		{selectedDays}
		onExport={handleExport}
	/>
	{#if !cleanMode}
		<div class="back-slot">
			<IconButton label="返回列表" href={resolve('/')}>
				<ArrowLeft size={22} />
			</IconButton>
		</div>
		<StatsCard summary={data.summary} days={dayGroups.days} {selectedDays} ontoggle={toggleDay} />
		{#if prepared.hasEle}
			{#if openTool == null && trackStyle.elevationColoring}
				<LegendCard {prepared} />
			{/if}
			<ElevationProfile
				bind:this={profileView}
				{prepared}
				bind:collapsed={profileCollapsed}
				onhover={(km) => km != null && mapView?.setCursorByKm(km)}
			/>
		{/if}
	{/if}
</div>

<style>
	.map-page {
		position: fixed;
		inset: 0;
		background: var(--map-bg);
	}

	.back-slot {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1001;
	}
</style>
