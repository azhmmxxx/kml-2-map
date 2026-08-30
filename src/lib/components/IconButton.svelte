<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * 公共图标按钮：44×44 触控友好尺寸（可调），真 button/a 语义。
	 * 视觉基础类 .icon-btn 定义在全局 app.css——需与 Leaflet 运行时
	 * 生成的命令式图标按钮（如图层选择控件）共用同一套样式。
	 * 图标内容用 snippet 传入，currentColor 继承文字色。
	 *
	 * 链接模式（传 href）：调用方必须传入 resolve() 的返回值，
	 * 组件不重复包装（模板内的 href 豁免即为此约定）。
	 */
	interface Props {
		/** 无障碍标签（兼悬停提示） */
		label: string;
		/** 边长（px），默认 44 = 移动端触控最小推荐尺寸 */
		size?: number;
		/** 提供则渲染为链接而非 button */
		href?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}
	let { label, size = 44, href, onclick, children }: Props = $props();
</script>

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		class="icon-btn"
		{href}
		style="width:{size}px;height:{size}px"
		aria-label={label}
		title={label}
	>
		{@render children()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		class="icon-btn"
		type="button"
		style="width:{size}px;height:{size}px"
		aria-label={label}
		title={label}
		{onclick}
	>
		{@render children()}
	</button>
{/if}
