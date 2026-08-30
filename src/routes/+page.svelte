<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { parseKml } from '$lib/kml/parser';
	import { deleteTrack, listSummaries, newTrackId, saveTrack } from '$lib/storage/db';
	import { fmtDate, fmtNum } from '$lib/format';
	import type { TrackData, TrackSummary } from '$lib/types';

	let summaries = $state<TrackSummary[]>([]);
	let loaded = $state(false);
	let importing = $state<{ name: string } | null>(null);
	let errorMsg = $state<string | null>(null);
	let dragOver = $state(false);

	let input: HTMLInputElement;

	onMount(async () => {
		summaries = await listSummaries();
		loaded = true;
	});

	async function handleFiles(files: File[]) {
		errorMsg = null;
		const kmls = files.filter((f) => /\.kml$/i.test(f.name));
		if (!kmls.length) {
			errorMsg = '请选择 .kml 文件';
			return;
		}
		let firstId: string | null = null;
		for (const f of kmls) {
			importing = { name: f.name };
			// 让加载态先渲染（解析是同步重活）
			await new Promise((r) => setTimeout(r, 30));
			try {
				const text = await f.text();
				const parsed = parseKml(text, f.name.replace(/\.kml$/i, ''));
				if (!parsed.segments.length) throw new Error('文件中未找到轨迹数据');
				const id = newTrackId();
				const summary: TrackSummary = {
					id,
					name: parsed.name,
					importedAt: Date.now(),
					fileSize: f.size,
					meta: parsed.meta,
					stats: parsed.stats
				};
				const data: TrackData = { id, segments: parsed.segments, waypoints: parsed.waypoints };
				await saveTrack(summary, data, f);
				if (!firstId) firstId = id;
			} catch (err) {
				errorMsg = `「${f.name}」解析失败：${err instanceof Error ? err.message : String(err)}`;
			}
			importing = null;
		}
		summaries = await listSummaries();
		if (firstId && kmls.length === 1) goto(resolve('/map/[id]', { id: firstId }));
	}

	async function remove(s: TrackSummary) {
		if (!confirm(`删除「${s.name}」？\n轨迹数据与原始文件将一并从本地删除。`)) return;
		await deleteTrack(s.id);
		summaries = await listSummaries();
	}
</script>

<svelte:head>
	<title>KML 轨迹地图</title>
</svelte:head>

<main class="page">
	<header class="hero">
		<h1>KML → 轨迹地图</h1>
		<p>
			上传两步路 / Google Earth 导出的 KML 轨迹，在浏览器中渲染海拔配色路线与剖面图。
			所有解析与存储均在本地完成，文件不会上传到任何服务器。
		</p>
	</header>

	<div
		class="dropzone"
		class:drag-over={dragOver}
		class:busy={importing != null}
		role="button"
		tabindex="0"
		onclick={() => input.click()}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && input.click()}
		ondragover={(e) => {
			e.preventDefault();
			dragOver = true;
		}}
		ondragleave={() => (dragOver = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragOver = false;
			handleFiles([...(e.dataTransfer?.files ?? [])]);
		}}
	>
		{#if importing}
			<div class="dz-busy"><span class="spinner"></span>正在解析 {importing.name} …</div>
		{:else}
			<div class="dz-icon">🗺️</div>
			<div class="dz-title">点击选择或拖入 .kml 文件</div>
			<div class="dz-sub">支持多文件 · 仅本地处理</div>
		{/if}
		<input
			bind:this={input}
			hidden
			type="file"
			accept=".kml"
			multiple
			onchange={(e) => {
				const el = e.currentTarget;
				const files = [...(el.files ?? [])];
				el.value = '';
				handleFiles(files);
			}}
		/>
	</div>

	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}

	<section class="list">
		{#if loaded && summaries.length === 0}
			<div class="empty">还没有轨迹。从上方导入第一个 KML 开始。</div>
		{:else if summaries.length}
			<div class="list-title">我的轨迹（{summaries.length}）</div>
			{#each summaries as s (s.id)}
				<div class="card-wrap">
					<div
						class="track-card"
						role="button"
						tabindex="0"
						onclick={() => goto(resolve('/map/[id]', { id: s.id }))}
						onkeydown={(e) =>
							(e.key === 'Enter' || e.key === ' ') && goto(resolve('/map/[id]', { id: s.id }))}
					>
						<div class="tc-main">
							<div class="tc-name">{s.name}</div>
							<div class="tc-meta">
								{fmtDate(s.importedAt)} 导入 · {fmtNum(s.stats.pointCount)} 点{#if s.stats.maxEle}&nbsp;·
									最高 {fmtNum(Math.round(s.stats.maxEle))} m{/if}
							</div>
						</div>
						<div class="tc-dist">{fmtNum(s.stats.distanceM / 1000, 1)}<small>km</small></div>
					</div>
					<button
						class="tc-del"
						title="删除"
						onclick={() => remove(s)}
						onkeydown={(e) => e.stopPropagation()}>删除</button
					>
				</div>
			{/each}
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 48px 20px 64px;
	}

	.hero h1 {
		font-size: 26px;
		letter-spacing: 1px;
	}

	.hero p {
		margin-top: 8px;
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink-3);
		max-width: 560px;
	}

	.dropzone {
		margin-top: 28px;
		border: 2px dashed #c9c2b4;
		border-radius: var(--radius);
		background: var(--card);
		padding: 36px 24px;
		text-align: center;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s,
			transform 0.15s;
	}

	.dropzone:hover,
	.dropzone.drag-over {
		border-color: var(--accent);
		background: #fffdf9;
	}

	.dropzone.drag-over {
		transform: scale(1.01);
	}

	.dropzone.busy {
		pointer-events: none;
	}

	.dz-icon {
		font-size: 34px;
	}

	.dz-title {
		margin-top: 10px;
		font-size: 15px;
		font-weight: 600;
	}

	.dz-sub {
		margin-top: 4px;
		font-size: 12px;
		color: var(--ink-2);
	}

	.dz-busy {
		font-size: 14px;
		color: var(--ink-3);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 8px 0;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #ddd6c9;
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error {
		margin-top: 14px;
		padding: 10px 14px;
		border-radius: 10px;
		background: #fdece8;
		color: #c92a2a;
		font-size: 13px;
		line-height: 1.6;
	}

	.list {
		margin-top: 32px;
	}

	.list-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-3);
		margin-bottom: 10px;
	}

	.empty {
		padding: 28px;
		text-align: center;
		font-size: 13px;
		color: var(--ink-2);
		border: 1px dashed #d8d1c2;
		border-radius: var(--radius);
	}

	.card-wrap {
		position: relative;
	}

	.track-card {
		display: flex;
		align-items: center;
		gap: 16px;
		background: var(--card);
		border-radius: 12px;
		padding: 14px 88px 14px 18px;
		margin-bottom: 10px;
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(30, 25, 20, 0.08);
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}

	.track-card:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(30, 25, 20, 0.14);
	}

	.tc-main {
		flex: 1;
		min-width: 0;
	}

	.tc-name {
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tc-meta {
		margin-top: 3px;
		font-size: 12px;
		color: var(--ink-2);
	}

	.tc-dist {
		font-size: 20px;
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		flex: none;
	}

	.tc-dist small {
		font-size: 11px;
		font-weight: 500;
		color: var(--ink-2);
		margin-left: 2px;
	}

	.tc-del {
		position: absolute;
		right: 14px;
		top: 50%;
		transform: translateY(-50%);
		border: none;
		background: none;
		color: var(--ink-2);
		font-size: 12px;
		cursor: pointer;
		padding: 6px 8px;
		border-radius: 6px;
	}

	.tc-del:hover {
		color: #c92a2a;
		background: #fdece8;
	}
</style>
