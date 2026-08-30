<script lang="ts">
	import MapView from '$lib/components/MapView.svelte';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StatsCard from '$lib/components/StatsCard.svelte';
	import LegendCard from '$lib/components/LegendCard.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { prepareTrack } from '$lib/geo/prepare';
	import { resolve } from '$app/paths';
	import type { TrackStyle } from '$lib/theme';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const prepared = $derived(prepareTrack(data.data.segments));

	/** 纯净预览：隐藏所有自定义覆盖层，仅保留地图本体 + 模式开关 */
	let cleanMode = $state(false);
	/** 当前打开的工具面板 id（来自 MapView 工具栏）：图例卡与面板区域冲突，此时让位 */
	let openTool = $state<string | null>(null);
	/** 海拔剖面收起态（与剖面组件双向绑定） */
	let profileCollapsed = $state(false);
	/** 轨迹渲染样式（设置面板可调；纯色模式下海拔图例失去意义） */
	let trackStyle = $state<TrackStyle>({
		weight: 3.5,
		elevationColoring: true,
		solidColor: '#e8590c',
		showEndpoints: true,
		showWaypoints: true
	});

	// 设置面板打开期间收起剖面；关闭后不自动恢复展开（由用户手动控制）
	$effect(() => {
		if (openTool === 'settings') profileCollapsed = true;
	});

	interface MapViewApi {
		setCursorByKm(km: number): void;
	}
	let mapView = $state<MapViewApi | undefined>();
</script>

<svelte:head>
	<title>{data.summary.name} · 轨迹地图</title>
</svelte:head>

<div class="map-page">
	<MapView
		bind:this={mapView}
		{prepared}
		waypoints={data.data.waypoints}
		{cleanMode}
		onToggleClean={() => (cleanMode = !cleanMode)}
		bind:openTool
		bind:trackStyle
	/>
	{#if !cleanMode}
		<div class="back-slot">
			<IconButton label="返回列表" href={resolve('/')}>
				<ArrowLeft size={22} />
			</IconButton>
		</div>
		<StatsCard summary={data.summary} />
		{#if prepared.hasEle}
			{#if openTool == null && trackStyle.elevationColoring}
				<LegendCard {prepared} />
			{/if}
			<ElevationProfile
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
		background: #e8e4dc;
	}

	.back-slot {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1001;
	}
</style>
