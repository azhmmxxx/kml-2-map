<script lang="ts">
	import { onMount } from 'svelte';
	import type { PreparedTrack } from '$lib/geo/prepare';
	import IconButton from './IconButton.svelte';
	import { Maximize2, Minimize2 } from '@lucide/svelte';

	interface Props {
		prepared: PreparedTrack;
		/** 悬停某公里处（null = 离开），父组件借此驱动地图游标 */
		onhover?: (km: number | null) => void;
		/** 收起态（bind 双向）：组件内按钮与外部联动（如设置面板打开）都可切换 */
		collapsed?: boolean;
	}
	let { prepared, onhover, collapsed = $bindable(false) }: Props = $props();

	const H = 150;
	const PAD = { l: 46, r: 14, t: 14, b: 20 };
	const MAX_SAMPLES = 1200;

	let svgEl: SVGSVGElement;

	interface Sample {
		km: number;
		ele: number;
	}
	let samples: Sample[] = [];

	let W = 1000;
	let xScale!: (km: number) => number;
	let yScale!: (e: number) => number;
	let gHover: SVGGElement | null = null;

	function downsample(p: PreparedTrack): Sample[] {
		const n = p.points.length;
		const stride = Math.max(1, Math.ceil(n / MAX_SAMPLES));
		const out: Sample[] = [];
		for (let i = 0; i < n; i += stride) {
			out.push({ km: p.points[i].km, ele: p.points[i].ele });
		}
		// 保证终点在样本内
		const last = p.points[n - 1];
		if (out[out.length - 1].km !== last.km) out.push({ km: last.km, ele: last.ele });
		return out;
	}

	onMount(() => {
		const ro = new ResizeObserver(() => build());
		ro.observe(svgEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		samples = downsample(prepared);
		build();
	});

	function build() {
		if (!svgEl) return;
		const rectW = svgEl.clientWidth;
		if (rectW > 50) W = rectW;
		svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
		svgEl.innerHTML = '';

		const p = prepared;
		const eleMin = Math.floor(p.eleMin / 500) * 500;
		const eleMax = Math.ceil(p.eleMax / 500) * 500;
		const totalKm = Math.max(p.totalKm, 0.001);
		xScale = (km) => PAD.l + (km / totalKm) * (W - PAD.l - PAD.r);
		yScale = (e) => PAD.t + (1 - (e - eleMin) / Math.max(eleMax - eleMin, 1)) * (H - PAD.t - PAD.b);

		const NS = 'http://www.w3.org/2000/svg';
		const el = (tag: string, attrs: Record<string, string | number>) => {
			const node = document.createElementNS(NS, tag);
			for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
			return node;
		};

		// 海拔渐变填充
		const defs = el('defs', {});
		const grad = el('linearGradient', { id: 'eleGrad', x1: 0, y1: 1, x2: 0, y2: 0 });
		const stops: Array<[number, string]> = [
			[0, '#00b09b'],
			[0.25, '#8bc34a'],
			[0.45, '#f9d423'],
			[0.62, '#ffa726'],
			[0.78, '#ff5252'],
			[0.9, '#d500f9'],
			[1, '#651fff']
		];
		for (const [o, c] of stops)
			grad.appendChild(el('stop', { offset: o, 'stop-color': c, 'stop-opacity': 0.55 }));
		defs.appendChild(grad);
		svgEl.appendChild(defs);

		// 网格 + 刻度
		const gGrid = el('g', {});
		for (let e = Math.max(1000, eleMin + 500); e <= eleMax; e += 1000) {
			const y = yScale(e);
			gGrid.appendChild(
				el('line', {
					x1: PAD.l,
					x2: W - PAD.r,
					y1: y,
					y2: y,
					stroke: '#e6dfd2',
					'stroke-width': 1,
					'stroke-dasharray': e % 2000 === 0 ? '0' : '3,4'
				})
			);
			const txt = el('text', {
				x: PAD.l - 6,
				y: y + 3.5,
				'text-anchor': 'end',
				'font-size': 9.5,
				fill: '#9a9384'
			});
			txt.textContent = `${e}m`;
			gGrid.appendChild(txt);
		}
		const xStep = totalKm > 3000 ? 500 : 250;
		for (let km = 0; km <= totalKm; km += xStep) {
			const txt = el('text', {
				x: xScale(km),
				y: H - 6,
				'text-anchor': 'middle',
				'font-size': 9.5,
				fill: '#9a9384'
			});
			txt.textContent = `${km}km`;
			gGrid.appendChild(txt);
		}
		svgEl.appendChild(gGrid);

		// 面积 + 折线
		let d = `M ${xScale(samples[0].km)} ${yScale(samples[0].ele)}`;
		for (let i = 1; i < samples.length; i++)
			d += ` L ${xScale(samples[i].km)} ${yScale(samples[i].ele)}`;
		svgEl.appendChild(
			el('path', {
				d: `${d} L ${xScale(totalKm)} ${H - PAD.b} L ${xScale(0)} ${H - PAD.b} Z`,
				fill: 'url(#eleGrad)'
			})
		);
		svgEl.appendChild(
			el('path', { d, fill: 'none', stroke: 'rgba(60,55,45,.5)', 'stroke-width': 1 })
		);

		// 最高点标记
		let maxIdx = 0;
		for (let i = 1; i < samples.length; i++) if (samples[i].ele > samples[maxIdx].ele) maxIdx = i;
		const mx = xScale(samples[maxIdx].km);
		const my = yScale(samples[maxIdx].ele);
		svgEl.appendChild(
			el('circle', { cx: mx, cy: my, r: 3, fill: '#651fff', stroke: '#fff', 'stroke-width': 1.5 })
		);
		const mtxt = el('text', {
			x: Math.min(mx, W - 80),
			y: my - 7,
			'font-size': 10,
			'font-weight': 600,
			fill: '#5f48c2'
		});
		mtxt.textContent = `最高 ${Math.round(samples[maxIdx].ele)}m · ${Math.round(samples[maxIdx].km)}km`;
		svgEl.appendChild(mtxt);

		// 悬停指示层
		gHover = el('g', {}) as SVGGElement;
		gHover.style.display = 'none';
		gHover.appendChild(
			el('line', { y1: PAD.t, y2: H - PAD.b, stroke: '#e8590c', 'stroke-width': 1.2 })
		);
		gHover.appendChild(
			el('circle', { r: 4.5, fill: '#e8590c', stroke: '#fff', 'stroke-width': 2 })
		);
		gHover.appendChild(el('rect', { rx: 5, height: 17, fill: 'rgba(38,34,28,.92)' }));
		const ht = el('text', {
			'font-size': 10,
			fill: '#fff',
			'dominant-baseline': 'middle',
			'text-anchor': 'middle'
		});
		gHover.appendChild(ht);
		svgEl.appendChild(gHover);
	}

	function onMove(ev: MouseEvent) {
		if (!gHover || !samples.length) return;
		const rect = svgEl.getBoundingClientRect();
		const x = ((ev.clientX - rect.left) * W) / rect.width;
		if (x < PAD.l - 4 || x > W - PAD.r + 4) {
			gHover.style.display = 'none';
			onhover?.(null);
			return;
		}
		const km = Math.max(
			0,
			Math.min(prepared.totalKm, ((x - PAD.l) / (W - PAD.l - PAD.r)) * prepared.totalKm)
		);
		// 最近样本点
		let lo = 0;
		let hi = samples.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (samples[mid].km < km) lo = mid + 1;
			else hi = mid;
		}
		const s = samples[lo];
		const px = xScale(s.km);
		const py = yScale(s.ele);
		gHover.style.display = '';
		const hl = gHover.children[0] as SVGLineElement;
		const hc = gHover.children[1] as SVGCircleElement;
		const hb = gHover.children[2] as SVGRectElement;
		const ht = gHover.children[3] as SVGTextElement;
		hl.setAttribute('x1', String(px));
		hl.setAttribute('x2', String(px));
		hc.setAttribute('cx', String(px));
		hc.setAttribute('cy', String(py));
		ht.textContent = `${Math.round(s.km)} km · ${Math.round(s.ele)} m`;
		const tw = ht.getComputedTextLength();
		hb.setAttribute('width', String(tw + 14));
		hb.setAttribute('x', String(Math.min(Math.max(px - (tw + 14) / 2, 2), W - tw - 16)));
		hb.setAttribute('y', String(PAD.t + 2));
		ht.setAttribute('x', String(Number(hb.getAttribute('x')) + (tw + 14) / 2));
		ht.setAttribute('y', String(PAD.t + 11));
		onhover?.(km);
	}

	function onLeave() {
		if (gHover) gHover.style.display = 'none';
		onhover?.(null);
	}
</script>

<div class="profile-panel" class:collapsed>
	<div class="profile-head">
		<span class="t">海拔剖面</span>
		<span class="hint">悬停查看沿途海拔 · 与地图联动</span>
		<div class="toggle-slot">
			<IconButton
				label={collapsed ? '展开海拔剖面' : '收起海拔剖面'}
				size={28}
				onclick={() => (collapsed = !collapsed)}
			>
				{#if collapsed}
					<Maximize2 size={16} />
				{:else}
					<Minimize2 size={16} />
				{/if}
			</IconButton>
		</div>
	</div>
	<div class="profile-body">
		<svg
			bind:this={svgEl}
			onmousemove={onMove}
			onmouseleave={onLeave}
			role="img"
			aria-label="海拔剖面图"
		></svg>
	</div>
</div>

<style>
	.profile-panel {
		position: absolute;
		/* 左右留出底部角落控件的空间（左：比例尺，右：缩放按钮） */
		left: 72px;
		right: 72px;
		bottom: 30px;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		border-radius: 14px;
		box-shadow: 0 4px 24px rgba(30, 25, 20, 0.2);
		padding: 8px 16px;
	}

	/* 收起态：与统计卡（header-card）同位同宽（定宽 420px），仅保留标题 + 展开按钮 */
	.profile-panel.collapsed {
		left: 68px;
		right: auto;
		width: 420px;
	}

	.toggle-slot {
		flex: none;
		/* 推到行尾；收起态 hint 隐藏后按钮仍保持右对齐 */
		margin-left: auto;
	}

	.profile-head {
		display: flex;
		align-items: center;
		gap: 10px;
		user-select: none;
	}

	.profile-head .t {
		font-size: 13px;
		font-weight: 600;
		color: #26221c;
	}

	.profile-head .hint {
		font-size: 11px;
		color: #9a9384;
	}

	.profile-panel.collapsed .hint {
		display: none;
	}

	.profile-panel.collapsed :global(.profile-body) {
		display: none;
	}

	.profile-body {
		position: relative;
		margin-top: 4px;
	}

	svg {
		display: block;
		width: 100%;
		height: 150px;
		cursor: crosshair;
	}

	@media (max-width: 640px) {
		.profile-panel {
			left: 96px;
			right: 60px;
		}

		/* 移动端与统计卡（left 68 / right 12 通栏）对齐 */
		.profile-panel.collapsed {
			left: 68px;
			right: 12px;
			width: auto;
		}
	}
</style>
