<script lang="ts">
	import type { PreparedTrack } from '$lib/geo/prepare';
	import { ELEVATION_COLORS } from '$lib/theme';

	/** 海拔着色图例：色带 + 按当前轨迹海拔范围动态计算的刻度 */
	let { prepared }: { prepared: PreparedTrack } = $props();

	const gradient = `linear-gradient(90deg, ${ELEVATION_COLORS.join(',')})`;

	// 色带等分刻度（两端带单位），四分位取值
	const marks = $derived(
		[0, 1, 2, 3, 4].map((i) =>
			Math.round(prepared.eleMin + ((prepared.eleMax - prepared.eleMin) * i) / 4)
		)
	);
</script>

<div class="legend-card">
	<div class="t">海拔着色</div>
	<div class="legbar" style:background={gradient}></div>
	<div class="legend-scale">
		<span>{marks[0]} m</span>
		<span>{marks[1]}</span>
		<span>{marks[2]}</span>
		<span>{marks[3]}</span>
		<span>{marks[4]} m</span>
	</div>
</div>

<style>
	.legend-card {
		position: absolute;
		top: 16px;
		right: 72px;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.93);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		padding: 12px 14px;
		box-shadow: 0 4px 24px rgba(30, 25, 20, 0.18);
		font-size: 11px;
		color: #6b655a;
		width: 210px;
	}

	.legend-card .t {
		font-weight: 600;
		color: #26221c;
		margin-bottom: 7px;
		font-size: 12px;
	}

	.legbar {
		height: 10px;
		border-radius: 5px;
	}

	.legend-scale {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
		color: #8a8378;
		font-variant-numeric: tabular-nums;
	}

	/* 小屏沿 PoC 行为隐藏图例 */
	@media (max-width: 640px) {
		.legend-card {
			display: none;
		}
	}
</style>
