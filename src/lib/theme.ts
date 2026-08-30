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

/** 轨迹渲染样式（设置面板可调，页面层持有） */
export interface TrackStyle {
	/** 轨迹线宽（px）；白色描边 = 线宽 + 2.5 */
	weight: number;
	/** 海拔分色着色（默认 true）；false = 使用 solidColor 纯色 */
	elevationColoring: boolean;
	/** 自定义纯色（仅 elevationColoring = false 时生效） */
	solidColor: string;
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
