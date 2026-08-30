/**
 * Svelte 编译器与 svelte-check 共用的配置。
 * （构建配置在 vite.config.ts；本文件专注于编译期警告策略。）
 *
 * 本项目是视觉交互密集型工具（地图 / SVG 剖面 / 动画），
 * a11y 类警告（img 缺 alt、可交互元素无键盘事件等）视为噪音主动过滤。
 */
export default {
	onwarn(warning, handler) {
		if (warning.code?.startsWith('a11y_')) return;
		handler(warning);
	}
};
