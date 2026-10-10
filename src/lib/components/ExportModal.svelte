<!--
	导出配置模态窗：设置面板仅保留「导出图片」入口，配置项（格式 / 内容 / 地图级别）集中于此。
	Esc / 取消 / 关闭按钮退出；确认后先关窗再执行导出（页面 handleExport）。
-->
<script lang="ts">
	import { Download, X } from '@lucide/svelte';
	import Segmented from './Segmented.svelte';
	import { estimateExportSize, type ExportOptions } from '$lib/exportImage';

	interface Props {
		open: boolean;
		onopenchange: (open: boolean) => void;
		/** 导出选项（bind 双向，页面持有；级别模式由 MapView 导出时消费） */
		exportOptions: ExportOptions;
		/** 路线 WGS-84 包围盒（SW/NE 经纬度），估算级别导出尺寸用；无轨迹时 null */
		routeBounds: [[number, number], [number, number]] | null;
		/** 当前视野缩放级（自定义级别的初值） */
		viewZoom: number;
		/** 确认导出（关闭窗口后由页面执行） */
		onexport: () => void;
	}
	let {
		open,
		onopenchange,
		exportOptions = $bindable(),
		routeBounds,
		viewZoom,
		onexport
	}: Props = $props();

	const FORMAT_MODES = [
		{ value: 'png', label: 'PNG' },
		{ value: 'gif', label: 'GIF' }
	] as const;

	const ZOOM_MODES = [
		{ value: 'view', label: '当前视野' },
		{ value: 'level', label: '自定义级别' }
	] as const;

	// 首次切到自定义级别时以当前视野级别为初值（-1 = 尚未选择过）
	$effect(() => {
		if (exportOptions.zoomMode === 'level' && exportOptions.level < 0)
			exportOptions.level = Math.min(14, Math.max(8, Math.round(viewZoom) || 10));
	});

	/** 级别导出的实际尺寸预估（超出画布上限自动降级时一并提示） */
	const levelHint = $derived.by(() => {
		if (exportOptions.zoomMode !== 'level' || !routeBounds || exportOptions.level < 0) return null;
		const est = estimateExportSize(routeBounds, exportOptions.level);
		const clamped = est.level !== Math.round(exportOptions.level);
		return `${clamped ? `超出画布上限，自动降至 ${est.level} 级 · ` : ''}约 ${est.w}×${est.h} px`;
	});

	function close() {
		onopenchange(false);
	}

	/** 确认导出：先收起弹窗再执行（导出耗时 / 报错由页面提示） */
	function confirmExport() {
		close();
		onexport();
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
	<!-- 遮罩不响应点击关闭（a11y）：Esc / 取消 / 关闭按钮退出 -->
	<div class="modal-mask">
		<div class="modal" role="dialog" aria-modal="true" aria-label="导出图片">
			<header class="modal-head">
				<h2>导出图片</h2>
				<button type="button" class="icon-btn" aria-label="关闭" onclick={close}>
					<X size={18} />
				</button>
			</header>

			<div class="modal-body">
				<div class="field">
					<div class="field-label">格式</div>
					<Segmented label="导出格式" options={FORMAT_MODES} bind:value={exportOptions.format} />
					{#if exportOptions.format === 'gif'}
						<div class="hint-text">
							GIF：选中段按屏幕闪烁动画导出，未选中段保持灰显；帧自动缩放（长边 ≤1600
							px），编码需数秒
						</div>
					{/if}
				</div>

				<div class="field field-row">
					<span class="row-label">海拔着色</span>
					<label class="switch" title="导出图片中是否包含海拔着色图例">
						<input type="checkbox" bind:checked={exportOptions.legend} />
						<span class="slider"></span>
					</label>
				</div>

				<div class="field field-row">
					<span class="row-label">海拔剖面</span>
					<label class="switch" title="导出图片中是否包含海拔剖面图">
						<input type="checkbox" bind:checked={exportOptions.profile} />
						<span class="slider"></span>
					</label>
				</div>

				<div class="field field-row">
					<span class="row-label">路线信息</span>
					<label class="switch" title="导出图片中是否包含左上角路线信息卡片">
						<input type="checkbox" bind:checked={exportOptions.stats} />
						<span class="slider"></span>
					</label>
				</div>

				<div class="field">
					<div class="field-label">
						地图级别
						{#if exportOptions.zoomMode === 'level' && exportOptions.level >= 0}
							<span class="field-value">{exportOptions.level} 级</span>
						{/if}
					</div>
					<Segmented
						label="导出地图级别模式"
						options={ZOOM_MODES}
						bind:value={exportOptions.zoomMode}
					/>
					{#if exportOptions.zoomMode === 'level'}
						<input
							class="level-range"
							type="range"
							min="8"
							max="14"
							step="1"
							bind:value={exportOptions.level}
						/>
						{#if levelHint}
							<div class="hint-text">画布按路线包围盒自适应 · {levelHint}</div>
						{/if}
					{/if}
				</div>
			</div>

			<footer class="modal-foot">
				<button type="button" class="btn" onclick={close}>取消</button>
				<button type="button" class="btn primary" onclick={confirmExport}>
					<Download size={15} />
					导出
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.modal-mask {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: grid;
		place-items: center;
		background: rgba(15, 12, 8, 0.45);
		backdrop-filter: blur(2px);
		animation: mask-in 0.15s ease;
	}

	.modal {
		width: min(440px, calc(100vw - 32px));
		max-height: min(86vh, 640px);
		display: flex;
		flex-direction: column;
		background: var(--card-solid);
		border-radius: 14px;
		box-shadow: var(--shadow);
		animation: modal-in 0.18s ease;
	}

	@keyframes mask-in {
		from {
			opacity: 0;
		}
	}

	@keyframes modal-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.98);
		}
	}

	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 10px;
	}

	.modal-head h2 {
		font-size: 16px;
		font-weight: 700;
		color: var(--ink);
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--ink-3);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--hover);
		color: var(--ink);
	}

	.modal-body {
		padding: 6px 20px 4px;
		overflow-y: auto;
	}

	.field {
		margin-top: 14px;
	}

	.field:first-child {
		margin-top: 4px;
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

	.level-range {
		width: 100%;
		margin-top: 8px;
		accent-color: var(--accent);
	}

	.hint-text {
		margin-top: 6px;
		font-size: 11px;
		color: var(--ink-4);
	}

	.modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 14px 20px 16px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 18px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: none;
		font-size: 13px;
		color: var(--ink-2);
		cursor: pointer;
	}

	.btn:hover {
		background: var(--hover);
		color: var(--ink);
	}

	.btn.primary {
		border: none;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
	}

	.btn.primary:hover {
		filter: brightness(0.94);
	}

	.btn.primary:active {
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
</style>
