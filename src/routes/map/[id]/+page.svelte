<script lang="ts">
	import MapView from '$lib/components/MapView.svelte';
	import ElevationProfile from '$lib/components/ElevationProfile.svelte';
	import StatsCard from '$lib/components/StatsCard.svelte';
	import { prepareTrack } from '$lib/geo/prepare';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const prepared = $derived(prepareTrack(data.data.segments));

	interface MapViewApi {
		setCursorByKm(km: number): void;
	}
	let mapView = $state<MapViewApi | undefined>();
</script>

<svelte:head>
	<title>{data.summary.name} · 轨迹地图</title>
</svelte:head>

<div class="map-page">
	<MapView bind:this={mapView} {prepared} waypoints={data.data.waypoints} />
	<a class="back-btn" href={resolve('/')} title="返回列表">←</a>
	<StatsCard summary={data.summary} />
	{#if prepared.hasEle}
		<ElevationProfile {prepared} onhover={(km) => km != null && mapView?.setCursorByKm(km)} />
	{/if}
</div>

<style>
	.map-page {
		position: fixed;
		inset: 0;
		background: #e8e4dc;
	}

	.back-btn {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1001;
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.93);
		backdrop-filter: blur(10px);
		border-radius: 10px;
		box-shadow: var(--shadow);
		color: var(--ink);
		font-size: 16px;
		text-decoration: none;
	}

	.back-btn:hover {
		background: #fff;
	}
</style>
