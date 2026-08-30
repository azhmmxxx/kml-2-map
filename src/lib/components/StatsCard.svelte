<script lang="ts">
	import type { TrackSummary } from '$lib/types';
	import { dateRangeLabel, durationDays, fmtNum } from '$lib/format';

	let { summary }: { summary: TrackSummary } = $props();

	const s = $derived(summary.stats);
	const range = $derived(dateRangeLabel(s.startTime, s.endTime));
	const days = $derived(durationDays(s.startTime, s.endTime));

	const subtitle = $derived(
		[summary.meta.author, range ? `${range}（${days} 天）` : null].filter(Boolean).join(' · ') ||
			'本地轨迹'
	);
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
</div>

<style>
	.header-card {
		position: absolute;
		top: 16px;
		left: 72px;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.93);
		backdrop-filter: blur(10px);
		border-radius: 14px;
		padding: 11px 22px;
		box-shadow: 0 4px 24px rgba(30, 25, 20, 0.18);
		/* 定宽而非 max-width：与收起态的剖面面板（同 420px）严格对齐 */
		width: 420px;
	}

	h1 {
		font-size: 21px;
		line-height: 1;
		color: #26221c;
		letter-spacing: 1px;
		font-weight: 700;
	}

	.subtitle {
		font-size: 12px;
		color: #8a8378;
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
		color: #26221c;
		font-variant-numeric: tabular-nums;
	}

	.stat .v small {
		font-size: 11px;
		font-weight: 500;
		color: #8a8378;
		margin-left: 2px;
	}

	.stat .k {
		font-size: 11px;
		color: #8a8378;
		margin-top: 1px;
	}

	.route-line {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px dashed #ddd6c9;
		font-size: 12px;
		color: #5c564c;
	}

	.route-line .mid {
		flex: 1;
		text-align: center;
		color: #b5ada0;
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

	@media (max-width: 640px) {
		.header-card {
			left: 68px;
			right: 12px;
			width: auto;
		}
	}
</style>
