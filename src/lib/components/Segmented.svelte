<!--
	分段选择器：互斥选项组（如 海拔着色/自定义）。
	颜色走全局 CSS 变量，自动适配各风格。
-->
<script lang="ts" generics="T extends string | boolean">
	interface Props {
		/** 无障碍名称：说明该组选项控制什么 */
		label: string;
		options: ReadonlyArray<{ value: T; label: string }>;
		/** 当前选中值（bind 双向） */
		value: T;
	}
	let { label, options, value = $bindable() }: Props = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
	{#each options as opt (String(opt.value))}
		<button
			type="button"
			class="seg"
			class:active={value === opt.value}
			role="radio"
			aria-checked={value === opt.value}
			onclick={() => (value = opt.value)}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		margin-top: 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
	}

	.seg {
		border: none;
		background: none;
		padding: 6px 14px;
		font-size: 12px;
		color: var(--ink-3);
		cursor: pointer;
	}

	.seg + .seg {
		border-left: 1px solid var(--line);
	}

	.seg.active {
		background: var(--accent-soft);
		color: var(--accent-strong);
		font-weight: 600;
	}
</style>
