/** 轨迹点（解析自 KML） */
export interface TrackPoint {
	lat: number;
	lng: number;
	/** 海拔（米），可能缺失 */
	ele: number | null;
	/** 记录时间（epoch 毫秒），可能缺失 */
	time: number | null;
}

/** 一段连续轨迹（KML 中一个 gx:Track / LineString） */
export interface TrackSegment {
	points: TrackPoint[];
}

/** 标注点（起点 / 终点 / 途径点） */
export interface Waypoint {
	/** Placemark id，两步路格式：startPoint / endPoint / realPoint */
	id: string | null;
	name: string;
	lat: number;
	lng: number;
	ele: number | null;
	time: number | null;
	description: string | null;
}

/** 两步路 ExtendedData 元数据（其他来源可能为空） */
export interface TrackMeta {
	author: string | null;
	posStartName: string | null;
	posEndName: string | null;
	beginTime: number | null;
	endTime: number | null;
	tags: string | null;
}

export interface TrackStats {
	pointCount: number;
	/** 里程（米），段内累计、段间不计 */
	distanceM: number;
	maxEle: number;
	minEle: number;
	/** 累计爬升 / 下降（米），平滑后近似值 */
	gainM: number;
	lossM: number;
	startTime: number | null;
	endTime: number | null;
}

/** 轨迹摘要（列表页用，不含大数组） */
export interface TrackSummary {
	id: string;
	name: string;
	importedAt: number;
	fileSize: number;
	meta: TrackMeta;
	stats: TrackStats;
}

/** 轨迹全量几何（地图页加载） */
export interface TrackData {
	id: string;
	segments: TrackSegment[];
	waypoints: Waypoint[];
}

/** 解析结果（入库前） */
export interface ParsedKml {
	name: string;
	meta: TrackMeta;
	segments: TrackSegment[];
	waypoints: Waypoint[];
	stats: TrackStats;
}
