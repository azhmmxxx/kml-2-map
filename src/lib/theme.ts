/** 海拔配色（低 → 高，与 PoC 一致）。MapView 渲染与 LegendCard 图例共用同一来源。 */
export const ELEVATION_COLORS = [
	'#00b09b',
	'#8bc34a',
	'#f9d423',
	'#ffa726',
	'#ff5252',
	'#d500f9',
	'#651fff'
] as const;

/** 界面风格（设置面板可切换，页面层持有）：auto = 跟随系统，其余为固定风格 */
export type ThemeMode = 'auto' | 'light' | 'dark' | 'vintage' | 'violet';

/** 实际生效的主题（auto 已按系统偏好解析为 light / dark） */
export type AppTheme = 'light' | 'dark' | 'vintage' | 'violet';

/** 风格选项（设置面板渲染用）；dot 为选项色点的代表色 */
export interface ThemeOption {
	mode: ThemeMode;
	label: string;
	dot: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
	{ mode: 'light', label: '明亮', dot: '#ffffff' },
	{ mode: 'dark', label: '暗黑', dot: '#211e17' },
	{ mode: 'vintage', label: '复古', dot: '#e6dbc0' },
	{ mode: 'violet', label: '青紫', dot: '#262238' },
	{ mode: 'auto', label: '跟随系统', dot: 'linear-gradient(90deg, #ffffff 50%, #211e17 50%)' }
];

/** 轨迹动画效果（设置面板可调）：none = 无；blink = 选中段呼吸式闪烁（灰显段不参与；仅屏幕渲染，导出为静态图） */
export type TrackAnimation = 'none' | 'blink';

/** 轨迹渲染样式（设置面板可调，页面层持有） */
export interface TrackStyle {
	/** 轨迹线宽（px）；白色描边 = 线宽 + 2.5 */
	weight: number;
	/** 轨迹不透明度（0.2 – 1，设置面板可调）：只作用于选中段及其白色描边 */
	opacity: number;
	/** 海拔分色着色（默认 true）；false = 使用 solidColor 纯色 */
	elevationColoring: boolean;
	/** 自定义纯色（仅 elevationColoring = false 时生效） */
	solidColor: string;
	/** 动画效果（默认 none） */
	animation: TrackAnimation;
	/** 是否显示起止点（起点 / 终点 pin） */
	showEndpoints: boolean;
	/** 是否显示途径点标记 */
	showWaypoints: boolean;
}

/** 纯色轨迹的预置色板 */
export const TRACK_SOLID_COLORS = [
	'#e8590c',
	'#1971c2',
	'#2f9e44',
	'#7048e8',
	'#fa5252',
	'#26221c'
] as const;

/** 未选中日期路线的灰显色（浅暖灰，弱化但浅色街道 / 深色卫星底图上仍可辨） */
export const TRACK_DIM_COLOR = '#d9d5cc';

/** 未选中日期路线的恒定不透明度（浅灰 + 半透明双重弱化，不随「不透明度」设置变化） */
export const TRACK_DIM_OPACITY = 0.3;
