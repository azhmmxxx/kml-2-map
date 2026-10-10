/**
 * 冒烟测试：用真实 KML 文件验证纯逻辑管线（解析 → 统计 → 渲染准备 → 抽稀）。
 * 不依赖浏览器与 Leaflet，Node 24+ 直接运行：node scripts/smoke.ts [kml文件路径]
 */
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { parseKml } from '../src/lib/kml/parser.ts';
import { prepareTrack } from '../src/lib/geo/prepare.ts';
import { simplify } from '../src/lib/geo/simplify.ts';
import { wgs84ToGcj02 } from '../src/lib/geo/gcj02.ts';
import { haversine } from '../src/lib/geo/stats.ts';

const file = process.argv[2] ?? 'poc/川西大环线.kml';
if (!existsSync(file)) {
	console.error(`找不到 KML 文件：${file}\n用法：node scripts/smoke.ts <kml文件路径>`);
	console.error('（poc/ 已 gitignore，克隆后需自备本地 KML 文件）');
	process.exit(1);
}

const t0 = performance.now();
const text = readFileSync(file, 'utf-8');
const t1 = performance.now();
const parsed = parseKml(text, 'fallback');
const t2 = performance.now();
const prepared = prepareTrack(parsed.segments);
const t3 = performance.now();

console.log(
	`文件读取 ${(t1 - t0).toFixed(0)}ms | 解析 ${((t2 - t1) / 1000).toFixed(2)}s | prepare ${((t3 - t2) / 1000).toFixed(2)}s`
);
console.log('name:', parsed.name);
console.log(
	'segments:',
	parsed.segments.length,
	'| 单段点数:',
	parsed.segments.map((s) => s.points.length).join(',')
);
console.log('waypoints:', parsed.waypoints.map((w) => `${w.id ?? '?'}:${w.name}`).join(' | '));
console.log('meta:', JSON.stringify(parsed.meta));
console.log('stats:', JSON.stringify(parsed.stats));
console.log(
	'prepared: totalKm=%s points=%s ele=[%s, %s]',
	prepared.totalKm.toFixed(1),
	prepared.points.length,
	prepared.eleMin,
	prepared.eleMax
);

const flat = prepared.points.map((p) => [p.lat, p.lng] as [number, number]);
const simplified = simplify(flat, 1e-4);
console.log(`simplify: ${flat.length} -> ${simplified.length} 点`);

// ---- 断言（对照两步路官方统计：3583.5km / 最高 4909m，允许合理误差） ----
const km = parsed.stats.distanceM / 1000;
assert.ok(km > 3200 && km < 3900, `里程异常: ${km}km`);
assert.ok(
	parsed.stats.maxEle > 4500 && parsed.stats.maxEle < 5300,
	`最高海拔异常: ${parsed.stats.maxEle}m`
);
assert.ok(parsed.segments.length >= 10, `段数异常: ${parsed.segments.length}`);
assert.ok(
	parsed.waypoints.some((w) => w.id === 'startPoint'),
	'缺少起点标注'
);
assert.ok(
	parsed.waypoints.some((w) => w.id === 'endPoint'),
	'缺少终点标注'
);
assert.ok(Math.abs(prepared.totalKm - km) < 0.5, 'prepare 与 stats 里程不一致');
assert.ok(simplified.length >= 2 && simplified.length < flat.length, '抽稀结果异常');
assert.ok(
	Math.abs(parsed.stats.gainM - parsed.stats.lossM) / Math.max(parsed.stats.gainM, 1) < 0.35,
	'爬升/下降严重失衡'
);

// ---- GCJ-02 前向纠偏（高德底图对齐用） ----
const [gLng, gLat] = wgs84ToGcj02(104.06, 30.67); // 成都
const offM = haversine(30.67, 104.06, gLat, gLng);
console.log(`gcj02: 成都偏移 ${offM.toFixed(0)}m`);
assert.ok(offM > 50 && offM < 800, `GCJ 偏移量异常: ${offM.toFixed(0)}m`);
const [oLng, oLat] = wgs84ToGcj02(-0.1276, 51.5072); // 伦敦（境外应恒等）
assert.ok(oLng === -0.1276 && oLat === 51.5072, '境外坐标应恒等变换');

console.log('\n✅ 全部断言通过');
