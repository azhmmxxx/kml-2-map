<script lang="ts">
	import { Download, Settings } from '@lucide/svelte';
	import ToolButton from './ToolButton.svelte';
	import Segmented from './Segmented.svelte';
	import type { ExportOptions } from '$lib/exportImage';
	import { THEME_OPTIONS, TRACK_SOLID_COLORS, type ThemeMode, type TrackStyle } from '$lib/theme';

	interface Props {
		open: boolean;
		onopenchange: (open: boolean) => void;
		trackStyle: TrackStyle;
		/** 界面风格（明亮 / 暗黑 / 复古 / 青紫 / 跟随系统），页面层持有 */
		themeMode: ThemeMode;
		/** 导出选项（bind 双向，页面持有） */
		exportOptions: ExportOptions;
		/** 打开导出配置弹窗（配置项已迁移至 ExportModal） */
		onexport: () => void;
	}
	let {
		open,
		onopenchange,
		trackStyle = $bindable(),
		themeMode = $bindable(),
		exportOptions = $bindable(),
		onexport
	}: Props = $props();

	const COLOR_MODES = [
		{ value: true, label: '海拔着色' },
		{ value: false, label: '自定义' }
	] as const;

	const ANIM_MODES = [
		{ value: 'none', label: '无' },
		{ value: 'blink', label: '闪烁' }
	] as const;

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
				<div class="field-label">
					不透明度<span class="field-value">{Math.round(trackStyle.opacity * 100)}%</span>
				</div>
				<input
					class="weight-range"
					type="range"
					min="0.2"
					max="1"
					step="0.05"
					bind:value={trackStyle.opacity}
				/>
			</div>

			<div class="field">
				<div class="field-label">颜色</div>
				<Segmented
					label="轨迹颜色模式"
					options={COLOR_MODES}
					bind:value={trackStyle.elevationColoring}
				/>
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

			<div class="field">
				<div class="field-label">动画</div>
				<Segmented label="轨迹动画" options={ANIM_MODES} bind:value={trackStyle.animation} />
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

		<div class="group">
			<div class="group-title">风格</div>
			<div class="theme-list" role="radiogroup" aria-label="界面风格">
				{#each THEME_OPTIONS as opt (opt.mode)}
					<button
						type="button"
						class="theme-option"
						class:wide={opt.mode === 'auto'}
						class:active={themeMode === opt.mode}
						role="radio"
						aria-checked={themeMode === opt.mode}
						onclick={() => (themeMode = opt.mode)}
					>
						<span class="theme-dot" style:background={opt.dot}></span>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="group">
			<div class="group-title">导出</div>

			<!-- 配置项在 ExportModal 弹窗内选择，此处仅保留入口 -->
			<button type="button" class="export-btn" onclick={onexport}>
				<Download size={15} />
				导出图片
			</button>
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

	.group + .group {
		margin-top: 24px;
	}

	.group-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
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
		color: var(--ink-3);
	}

	.field-label {
		display: flex;
		align-items: center;
		font-size: 12px;
		color: var(--ink-3);
	}

	.field-value {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		font-weight: 600;
	}

	.weight-range {
		width: 100%;
		margin-top: 8px;
		accent-color: var(--accent);
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
		border: 2px solid var(--card-solid);
		box-shadow: 0 0 0 1px var(--line);
		cursor: pointer;
		padding: 0;
	}

	.swatch.active {
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px var(--card-solid);
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

	/* 风格选项：双列网格，跟随系统独占一行 */
	.theme-list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 10px;
	}

	.theme-option {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: none;
		padding: 8px 12px;
		font-size: 12px;
		color: var(--ink-3);
		cursor: pointer;
	}

	.theme-option.wide {
		grid-column: 1 / -1;
	}

	.theme-option:hover {
		background: var(--hover);
	}

	.theme-option.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-strong);
		font-weight: 600;
	}

	.theme-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid var(--line);
		flex: none;
	}

	.export-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		margin-top: 16px;
		padding: 9px 0;
		border: none;
		border-radius: 8px;
		background: var(--accent);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.export-btn:hover {
		filter: brightness(0.94);
	}

	.export-btn:active {
		transform: translateY(1px);
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
		background: var(--line);
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
		background: var(--card-solid);
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
		border-top: 1px dashed var(--line);
		font-size: 12px;
		color: var(--ink-4);
		text-align: center;
	}
</style>
