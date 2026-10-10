<script lang="ts">
	import { Maximize2, Minimize2 } from '@lucide/svelte';
	import type { TrackSummary } from '$lib/types';
	import type { DaySegment } from '$lib/geo/stats';
	import { dateRangeLabel, dayLabel, durHM, durationDays, fmtNum, timeHM } from '$lib/format';

	let {
		summary,
		/** 每日行程（页面层由 groupByDay 算好传入；空 = 轨迹无时间数据，隐藏展开入口） */
		days,
		/** 每日选中态（页面持有；未选中的日路线在地图上灰显） */
		selectedDays,
		/** 勾选/取消某天（页面更新选中态） */
		ontoggle
	}: {
		summary: TrackSummary;
		days: DaySegment[];
		selectedDays: boolean[];
		ontoggle: (startMs: number, on: boolean) => void;
	} = $props();

	const s = $derived(summary.stats);
	const range = $derived(dateRangeLabel(s.startTime, s.endTime));
	const dayCount = $derived(durationDays(s.startTime, s.endTime));

	const subtitle = $derived(
		[summary.meta.author, range ? `${range}（${dayCount} 天）` : null]
			.filter(Boolean)
			.join(' · ') || '本地轨迹'
	);

	/** 详细信息展开态 */
	let expanded = $state(false);

	const selectedCount = $derived(selectedDays.filter(Boolean).length);

	/** 全选 / 反选（复用逐日 ontoggle，页面层 offDayKeys 幂等增删） */
	function setAll(on: boolean) {
		for (let i = 0; i < days.length; i++) if (selectedDays[i] !== on) ontoggle(days[i].startMs, on);
	}
	function invertAll() {
		for (let i = 0; i < days.length; i++) ontoggle(days[i].startMs, !selectedDays[i]);
	}
</script>

<div class="header-card">
	<h1>{summary.name}</h1>
	<div class="subtitle">{subtitle}</div>
	<div class="stats">
		<div class="stat">
			<div class="v">{fmtNum(s.distanceM / 1000, 1)}<small>km</small></div>
			<div class="k">总里程</div>
		</div>
		<div class="stat">
			<div class="v">{fmtNum(s.pointCount)}</div>
			<div class="k">轨迹点</div>
		</div>
		<div class="stat">
			<div class="v">{s.maxEle ? fmtNum(Math.round(s.maxEle)) : '-'}<small>m</small></div>
			<div class="k">最高海拔</div>
		</div>
		<div class="stat">
			<div class="v">{s.minEle ? fmtNum(Math.round(s.minEle)) : '-'}<small>m</small></div>
			<div class="k">最低海拔</div>
		</div>
		<div class="stat">
			<div class="v">{fmtNum(Math.round(s.gainM))}<small>m</small></div>
			<div class="k">累计爬升</div>
		</div>
		<div class="stat">
			<div class="v">{fmtNum(Math.round(s.lossM))}<small>m</small></div>
			<div class="k">累计下降</div>
		</div>
	</div>
	<div class="route-line">
		<span class="dot start"></span><span>{summary.meta.posStartName ?? '起点'}</span>
		<span class="mid">— {fmtNum(s.distanceM / 1000)} km —</span>
		<span>{summary.meta.posEndName ?? '终点'}</span><span class="dot end"></span>
	</div>
	{#if days.length}
		<button type="button" class="detail-toggle" onclick={() => (expanded = !expanded)}>
			{#if expanded}
				<Minimize2 size={13} />
			{:else}
				<Maximize2 size={13} />
			{/if}
			<span>{expanded ? '收起详细路线信息' : '显示详细路线信息'}</span>
		</button>
		{#if expanded}
			<!-- 列表操作条：位于滚动容器之外，滚动时固定在列表顶部 -->
			<div class="day-actions">
				<button type="button" class="day-action-btn" onclick={() => setAll(true)}>全选</button>
				<button type="button" class="day-action-btn" onclick={invertAll}>反选</button>
				<span class="day-actions-count">已选 {selectedCount}/{days.length}</span>
			</div>
			<div class="day-list">
				{#each days as d, i (i)}
					<!-- label 包整行：任意位置点击即切换勾选；checkbox 独占首列 -->
					<label class="day-item" title="未选中日期的路线在地图上灰显">
						<input
							class="day-check"
							type="checkbox"
							checked={selectedDays[i]}
							onchange={(e) => ontoggle(d.startMs, e.currentTarget.checked)}
							aria-label={`地图上显示第 ${i + 1} 天的路线`}
						/>
						<span class="day-body">
							<span class="day-head">
								<span class="day-no">D{i + 1}</span>
								<span class="day-date">{dayLabel(d.startMs)}</span>
								<span class="day-range">{timeHM(d.startMs)} – {timeHM(d.endMs)}</span>
							</span>
							<span class="day-stats">
								<span><b>{fmtNum(d.km, 1)}</b> km</span>
								<span>用时 <b>{durHM(d.endMs - d.startMs)}</b></span>
								{#if d.maxEle != null}
									<span>最高 <b>{fmtNum(Math.round(d.maxEle))}</b> m</span>
									<span>爬升 <b>{fmtNum(Math.round(d.gainM))}</b> m</span>
								{/if}
							</span>
						</span>
					</label>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.header-card {
		position: absolute;
		top: 16px;
		left: 72px;
		z-index: 1000;
		background: var(--card);
		backdrop-filter: blur(10px);
		border-radius: 14px;
		padding: 11px 22px;
		box-shadow: var(--shadow);
		/* 定宽而非 max-width：与收起态的剖面面板（同 420px）严格对齐 */
		width: 420px;
	}

	h1 {
		font-size: 21px;
		line-height: 1;
		color: var(--ink);
		letter-spacing: 1px;
		font-weight: 700;
	}

	.subtitle {
		font-size: 12px;
		color: var(--ink-2);
		margin-top: 11px;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px 14px;
		margin-top: 12px;
	}

	.stat .v {
		font-size: 17px;
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.stat .v small {
		font-size: 11px;
		font-weight: 500;
		color: var(--ink-2);
		margin-left: 2px;
	}

	.stat .k {
		font-size: 11px;
		color: var(--ink-2);
		margin-top: 1px;
	}

	.route-line {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px dashed var(--line);
		font-size: 12px;
		color: var(--ink-3);
	}

	.route-line .mid {
		flex: 1;
		text-align: center;
		color: var(--ink-5);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
	}

	.dot.start {
		background: #2f9e44;
	}

	.dot.end {
		background: #e03131;
	}

	.detail-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		width: 100%;
		margin-top: 10px;
		padding: 4px 0 2px;
		border: none;
		border-top: 1px dashed var(--line);
		background: none;
		font-size: 11px;
		color: var(--ink-2);
		cursor: pointer;
	}

	.detail-toggle:hover {
		color: var(--accent-strong);
	}

	/* 列表操作条（全选/反选）：在 .day-list 滚动容器外部，不随内容滚动 */
	.day-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		padding: 0 4px 6px;
	}

	.day-action-btn {
		border: 1px solid var(--line);
		border-radius: 6px;
		background: none;
		padding: 3px 10px;
		font-size: 11px;
		color: var(--ink-2);
		cursor: pointer;
	}

	.day-action-btn:hover {
		color: var(--accent-strong);
		border-color: var(--accent);
	}

	.day-actions-count {
		margin-left: auto;
		font-size: 11px;
		color: var(--ink-4);
		font-variant-numeric: tabular-nums;
	}

	/* 卡片绝对定位在地图左上，展开时向下生长；列表超高内部滚动，卡片不超出视口 */
	.day-list {
		margin-top: 4px;
		max-height: min(40vh, 420px);
		overflow-y: auto;
		/* 只纵向滚动：横向溢出（如长文本）裁掉，不出现横向滚动条 */
		overflow-x: hidden;
	}

	.day-list::-webkit-scrollbar {
		width: 4px;
	}

	.day-list::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 2px;
	}

	.day-item {
		/* 首列 = 勾选框竖列，次列 = 日期与统计；整行可点（label 包裹）。
		   不用负 margin 做悬停出血——会把内容撑出列表宽度，出现横向滚动条 */
		display: grid;
		grid-template-columns: 20px 1fr;
		column-gap: 8px;
		align-items: start;
		padding: 8px 8px 7px 4px;
		border-radius: 8px;
		cursor: pointer;
	}

	.day-item:hover {
		background: var(--hover);
	}

	.day-item + .day-item {
		border-top: 1px dashed var(--line);
	}

	.day-body {
		display: block;
		min-width: 0;
	}

	.day-check {
		width: 14px;
		height: 14px;
		margin: 2px 0 0;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.day-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		color: var(--ink);
	}

	.day-no {
		font-size: 11px;
		font-weight: 700;
		color: var(--accent-strong);
	}

	.day-date {
		font-size: 12px;
		font-weight: 600;
	}

	.day-range {
		margin-left: auto;
		font-size: 11px;
		color: var(--ink-4);
		font-variant-numeric: tabular-nums;
	}

	.day-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 14px;
		margin-top: 4px;
		font-size: 11px;
		color: var(--ink-2);
	}

	.day-stats b {
		font-weight: 600;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.header-card {
			left: 68px;
			right: 12px;
			width: auto;
		}
	}
</style>
