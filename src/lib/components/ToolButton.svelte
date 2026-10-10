<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';

	/**
	 * 通用工具按钮骨架：图标按钮 + 向左展开的面板，
	 * 点击外部 / Esc 关闭；开合状态受控（由工具栏层做单开互斥）。
	 * 面板内容通过 children snippet 注入。
	 */
	interface Props {
		label: string;
		/** 图标组件（如 lucide 的 Layers / Settings） */
		icon: Component;
		open: boolean;
		onopenchange: (open: boolean) => void;
		/** 面板宽度（px），高度自动 */
		panelWidth?: number;
		/** 面板与按钮的间距（px），决定面板在视口中的右缘位置 */
		panelGap?: number;
		/** 面板铺满视窗高度：top:16 → bottom:30（46 = 16 + 30） */
		fullHeight?: boolean;
		children: Snippet;
	}
	let {
		label,
		icon: Icon,
		open,
		onopenchange,
		panelWidth = 140,
		panelGap = 12,
		fullHeight = false,
		children
	}: Props = $props();

	let toolEl: HTMLDivElement;
</script>

<svelte:document
	onclick={(e) => {
		if (open && !toolEl.contains(e.target as Node)) onopenchange(false);
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) onopenchange(false);
	}}
/>

<div class="tool" bind:this={toolEl}>
	<IconButton {label} onclick={() => onopenchange(!open)}>
		<Icon size={22} />
	</IconButton>
	{#if open}
		<div
			class="tool-panel"
			style:width="{panelWidth}px"
			style:right="calc(100% + {panelGap}px)"
			style:height={fullHeight ? 'calc(100dvh - 46px)' : null}
			role="group"
			aria-label={label}
		>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	/* .tool 保持 static：面板锚定到工具栏（.map-toolbar，视口 top:16）而非按钮自身，
	   保证无论按钮在竖排中的哪个位置，面板都在视口顶部展开 */
	.tool {
		display: flex;
	}

	/* 面板从工具栏左侧展开（工具栏贴屏幕右缘） */
	.tool-panel {
		position: absolute;
		top: 0;
		background: var(--card);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 6px;
	}
</style>
