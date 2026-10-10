<script lang="ts">
	import { Layers } from '@lucide/svelte';
	import ToolButton from './ToolButton.svelte';

	interface BaseOption {
		label: string;
		active: boolean;
	}
	interface Props {
		options: BaseOption[];
		onselect: (index: number) => void;
		open: boolean;
		onopenchange: (open: boolean) => void;
	}
	let { options, onselect, open, onopenchange }: Props = $props();
</script>

<ToolButton label="选择底图" icon={Layers} {open} {onopenchange} panelWidth={132} panelGap={8}>
	{#each options as opt, i (opt.label)}
		<button
			class="tool-option"
			class:active={opt.active}
			onclick={() => {
				onselect(i);
				onopenchange(false);
			}}
		>
			{opt.label}
		</button>
	{/each}
</ToolButton>

<style>
	.tool-option {
		border: none;
		background: none;
		text-align: left;
		padding: 8px 12px;
		border-radius: 8px;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
		display: block;
		width: 100%;
	}

	.tool-option:hover {
		background: var(--hover);
	}

	.tool-option.active {
		background: var(--accent-soft);
		color: var(--accent-strong);
		font-weight: 600;
	}
</style>
