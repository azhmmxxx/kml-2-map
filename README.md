# kml-2-map

在浏览器本地将 KML 轨迹（两步路 / Google Earth 导出）渲染为交互式地图路书：海拔配色路线、统计卡片、海拔剖面联动。无后端，数据不离开浏览器。

## 开发

```bash
pnpm install
pnpm dev           # 本地开发服务器
pnpm check         # TypeScript / Svelte 类型检查
pnpm build         # 产出纯静态 SPA 到 build/
pnpm preview       # 本地预览构建产物
node scripts/smoke.ts   # 冒烟验证解析管线（默认用 poc/ 下的本地 KML；poc/ 不入库，克隆后需指定路径）
```

## 技术栈

- SvelteKit 2（Svelte 5 runes）+ TypeScript + Vite，纯静态 SPA（`ssr = false` + adapter-static fallback）
- Leaflet + canvas 渲染（Esri WGS-84 底图，与 GPS 轨迹无偏移）
- IndexedDB（`idb`）本地存储：摘要 / 全量几何 / 原始文件三个对象仓
- KML 解析为字符串扫描实现（15MB 级文件友好）

## 目录结构

```
src/lib/
  types.ts          数据模型
  kml/parser.ts     KML 解析（两步路 TbuluKmlVersion2 + 通用 LineString 回退）
  geo/stats.ts      里程 / 海拔统计（haversine + 平滑爬升）
  geo/prepare.ts    渲染准备（扁平化 + 跨段累计里程）
  geo/simplify.ts   Douglas-Peucker 抽稀
  storage/db.ts     IndexedDB 封装
  components/       MapView / ElevationProfile / StatsCard
src/routes/
  +page.svelte      文件选择 + 轨迹列表
  map/[id]/         地图页
poc/                早期 Python PoC（渲染逻辑已模块化迁入 src/lib）
```

## 部署

`pnpm build` 产物为纯静态文件，部署到 Cloudflare Pages（包管理器选 pnpm，构建命令 `pnpm build`，输出目录 `build`）或任意静态托管。

## 已知事项

- 爬升/下降为平滑近似算法，与两步路官方值存在约 ±5% 出入
- 「街道地图(高德)」通过本地 GCJ-02 前向纠偏对齐轨迹（社区公开算法，精度约 1 米，坐标不出浏览器）；瓦片为直接引用，非官方授权通道，商用需评估合规
