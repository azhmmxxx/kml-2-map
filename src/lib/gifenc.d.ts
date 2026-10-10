/* gifenc 无自带类型声明，此处按用到的 API 手写最小 d.ts */
declare module 'gifenc' {
	export interface GIFEncoderInstance {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			opts?: {
				palette?: number[][];
				delay?: number;
				transparent?: boolean;
				transparentIndex?: number;
				dispose?: number;
				repeat?: number;
				first?: boolean;
			}
		): void;
		finish(): void;
		bytes(): Uint8Array<ArrayBuffer>;
		bytesView(): Uint8Array<ArrayBuffer>;
		reset(): void;
	}
	export function GIFEncoder(opts?: {
		auto?: boolean;
		initialCapacity?: number;
	}): GIFEncoderInstance;
	export function quantize(
		data: Uint8ClampedArray | Uint8Array,
		maxColors: number,
		opts?: { format?: string; oneBitAlpha?: boolean | number; clearAlpha?: boolean }
	): number[][];
	export function applyPalette(
		data: Uint8ClampedArray | Uint8Array,
		palette: number[][],
		format?: string
	): Uint8Array;
}
