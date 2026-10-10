# CLAUDE.md

## 项目

kml-2-map：无后端的 KML 轨迹地图 SPA。用户上传 KML → 浏览器解析渲染 → IndexedDB 本地管理。中文回复用户。

## 常用命令

```bash
pnpm dev           # 开发
pnpm lint          # ESLint + Prettier 检查（提交前必须通过）
pnpm format        # Prettier 格式化
pnpm check         # 类型检查（提交前必须通过）
pnpm build         # 构建（提交前必须通过）
node scripts/smoke.ts   # 用 poc/川西大环线.kml 冒烟验证解析管线（改动 parser/stats/prepare 后运行）
```

## 架构要点

- 纯静态 SPA：`src/routes/+layout.ts` 里 `ssr = false`，adapter-static fallback（配置在 vite.config.ts 的 sveltekit() 插件内）
- `src/lib` 内部模块互相导入用**相对路径 + .ts 扩展名**（保持 Node 直跑冒烟测试的能力）；组件/页面用 `$lib` 别名
- 底图以 WGS-84（Esri 系）为主；高德街道为 GCJ-02，渲染几何经 `geo/gcj02.ts` 前向纠偏后叠加（切换图层时重投影，内部数据恒为 WGS-84）
- 渲染逻辑源自 `poc/build_map.py`（海拔 7 桶配色、白色 casing、剖面↔地图联动游标），迁移时保持行为一致

## Git 约定

- master 受分支保护：所有变更走 PR，不允许直接 push
- 分支命名 `feat/xxx`、`fix/xxx`；commit 用英文 conventional 风格
- 用户（仓库所有者）负责审批合并
- 写完新代码按 [doc/review/CODE_REVIEW.md](doc/review/CODE_REVIEW.md) 清单自查后再提 PR
