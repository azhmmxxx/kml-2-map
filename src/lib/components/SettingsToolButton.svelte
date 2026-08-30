<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import ToolButton from './ToolButton.svelte';
	import { TRACK_SOLID_COLORS, type TrackStyle } from '$lib/theme';

	interface Props {
		open: boolean;
		onopenchange: (open: boolean) => void;
		trackStyle: TrackStyle;
	}
	let { open, onopenchange, trackStyle = $bindable() }: Props = $props();

	const isPreset = (c: string) => (TRACK_SOLID_COLORS as readonly string[]).includes(c);
</script>

<!-- 设置面板：视口 top:16 / right:72 / 宽 420，铺满视窗高度（bottom:30） -->
<ToolButton label="设置" icon={Settings} {open} {onopenchange} panelWidth={420} fullHeight>
	<div class="settings-body">
		<div class="group">
			<div class="group-title">轨迹</div>

			<div class="field">
				<div class="field-label">
					粗细<span class="field-value">{trackStyle.weight.toFixed(1)} px</span>
				</div>
				<input
					class="weight-range"
					type="range"
					min="1"
					max="10"
					step="0.5"
					bind:value={trackStyle.weight}
				/>
			</div>

			<div class="field">
				<div class="field-label">颜色</div>
				<div class="segmented" role="radiogroup" aria-label="轨迹颜色模式">
					<button
						class="seg"
						class:active={trackStyle.elevationColoring}
						onclick={() => (trackStyle.elevationColoring = true)}
					>
						海拔着色
					</button>
					<button
						class="seg"
						class:active={!trackStyle.elevationColoring}
						onclick={() => (trackStyle.elevationColoring = false)}
					>
						自定义
					</button>
				</div>
				{#if !trackStyle.elevationColoring}
					<div class="swatches">
						{#each TRACK_SOLID_COLORS as c (c)}
							<button
								class="swatch"
								class:active={trackStyle.solidColor === c}
								style:background={c}
								title={c}
								onclick={() => (trackStyle.solidColor = c)}
							></button>
						{/each}
						<label
							class="swatch swatch-custom"
							class:active={!isPreset(trackStyle.solidColor)}
							title="自定义颜色"
						>
							<input type="color" bind:value={trackStyle.solidColor} />
						</label>
					</div>
				{/if}
			</div>

			<div class="field field-row">
				<span class="row-label">是否显示起止点</span>
				<label class="switch" title="显示 / 隐藏起点与终点标记">
					<input type="checkbox" bind:checked={trackStyle.showEndpoints} />
					<span class="slider"></span>
				</label>
			</div>

			<div class="field field-row">
				<span class="row-label">是否显示标记点</span>
				<label class="switch" title="显示 / 隐藏途径点标记">
					<input type="checkbox" bind:checked={trackStyle.showWaypoints} />
					<span class="slider"></span>
				</label>
			</div>
		</div>

		<div class="more-hint">更多设置开发中</div>
	</div>
</ToolButton>

<style>
	.settings-body {
		padding: 14px 16px;
		/* 铺满面板高度，内容超出时内部滚动 */
		height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
	}

	.group-title {
		font-size: 14px;
		font-weight: 600;
		color: #26221c;
	}

	.field {
		margin-top: 14px;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.row-label {
		font-size: 12px;
		color: #6b655a;
	}

	.field-label {
		display: flex;
		align-items: center;
		font-size: 12px;
		color: #6b655a;
	}

	.field-value {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		color: #26221c;
		font-weight: 600;
	}

	.weight-range {
		width: 100%;
		margin-top: 8px;
		accent-color: var(--accent);
	}

	.segmented {
		display: inline-flex;
		margin-top: 8px;
		border: 1px solid #ddd6c9;
		border-radius: 8px;
		overflow: hidden;
	}

	.seg {
		border: none;
		background: none;
		padding: 6px 14px;
		font-size: 12px;
		color: #6b655a;
		cursor: pointer;
	}

	.seg + .seg {
		border-left: 1px solid #ddd6c9;
	}

	.seg.active {
		background: #fdece4;
		color: #d9480f;
		font-weight: 600;
	}

	.swatches {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 0 0 1px #c9c2b4;
		cursor: pointer;
		padding: 0;
	}

	.swatch.active {
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px #fff;
	}

	.swatch-custom {
		background: conic-gradient(red, orange, yellow, green, blue, purple, red);
		position: relative;
		overflow: hidden;
	}

	.swatch-custom input {
		/* 覆盖在透明 label 上，点开原生取色器 */
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.switch {
		position: relative;
		width: 36px;
		height: 20px;
		flex: none;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.switch .slider {
		position: absolute;
		inset: 0;
		background: #c9c2b4;
		border-radius: 10px;
		transition: background 0.15s;
		cursor: pointer;
	}

	.switch .slider::before {
		content: '';
		position: absolute;
		width: 16px;
		height: 16px;
		left: 2px;
		top: 2px;
		background: #fff;
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(30, 25, 20, 0.3);
		transition: transform 0.15s;
	}

	.switch input:checked + .slider {
		background: var(--accent);
	}

	.switch input:checked + .slider::before {
		transform: translateX(16px);
	}

	.switch input:focus-visible + .slider {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.more-hint {
		margin-top: 24px;
		padding-top: 14px;
		border-top: 1px dashed #ddd6c9;
		font-size: 12px;
		color: #9a9384;
		text-align: center;
	}
</style>
