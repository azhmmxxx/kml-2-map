/**
 * WGS-84 → GCJ-02 前向转换（社区逆向的公开算法，俗称"火星坐标"偏移）。
 *
 * 背景：按测绘法规，境内公开地图服务（高德/腾讯等）对地理数据施加非线性
 * 偏移（GCJ-02）。GPS 轨迹是 WGS-84，直接叠加 GCJ-02 底图会偏移 100–700 米；
 * 渲染前做本变换即可对齐。
 *
 * - 精度：与官方在线转换相差约 1 米内，显示用途足够
 * - 仅境内坐标有偏移（境外返回原值）
 * - 纯本地计算，坐标不出浏览器；无官方逆变换（GCJ→WGS），但本场景只需前向
 */

const PI = Math.PI;
const A = 6378245.0; // 克拉索夫斯基椭球长半轴（米）
const EE = 0.00669342162296594; // 椭球偏心率平方（双精度安全位数）

/** 是否在中国境内（境内才施加 GCJ 偏移） */
function outOfChina(lng: number, lat: number): boolean {
	return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
	let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
	ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
	return ret;
}

function transformLng(x: number, y: number): number {
	let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
	ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
	return ret;
}

/** WGS-84 → GCJ-02。输入/输出均为 [经度, 纬度]。 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
	if (outOfChina(lng, lat)) return [lng, lat];
	let dLat = transformLat(lng - 105.0, lat - 35.0);
	let dLng = transformLng(lng - 105.0, lat - 35.0);
	const radLat = (lat / 180.0) * PI;
	let magic = Math.sin(radLat);
	magic = 1 - EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
	dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
	return [lng + dLng, lat + dLat];
}
