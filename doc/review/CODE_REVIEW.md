# 代码 Review 流程

> 本项目的代码评审流程。适用场景：写完新代码后按此流程自查 / 开 PR 后逐项核对。
> 骨架参考社区公认方案：[Google eng-practices](https://google.github.io/eng-practices/review/)、
> [Conventional Comments](https://conventionalcomments.org/)、
> [Svelte 官方 Best Practices](https://svelte.dev/docs/svelte/best-practices)，
> 并按本项目技术栈（Svelte 5 + TS + Leaflet + IndexedDB）定制。

## 核心原则

1. **工具管风格，人管设计**：格式、命名风格、类型、已知反模式已由 `pnpm lint` / `pnpm check` 覆盖，人工 review 不重复查这些，专注工具查不了的：设计合理性、逻辑正确性、边界条件
2. **小步提交**：单次 PR 控制在约 400 行 diff 以内（不含 lockfile），大功能拆成多次
3. **关注优先级**：正确性 > 设计 > 可读性 > 性能
4. **清单是活的**：发现某条人工检查可以自动化 → 沉淀成 ESLint 规则或 smoke 断言，然后从人工清单里划掉

## 第一步：自动门禁（全绿才能提 PR）

```bash
pnpm lint          # ESLint + Prettier：风格、格式、Svelte 反模式
pnpm check         # svelte-check：类型检查（strict）
pnpm build         # 构建通过
node scripts/smoke.ts   # 改动 parser/stats/prepare 任意一个时必跑
```

## 第二步：人工检查清单

逐节过 diff，每项都以问题形式给出。

### A. 结构与设计

- [ ] 文件放对层了吗：纯逻辑 → `src/lib`（geo/kml/storage），带渲染的组件 → `src/lib/components`，页面 → `src/routes`
- [ ] 导入方向单向吗：routes → components → lib，lib 内部不反向引用（`lib` 内互导用相对路径 + `.ts` 后缀，保持 Node 直跑能力）
- [ ] 单一职责：这个文件/函数只做一件事？出现第二处复制粘贴就该抽公共函数了
- [ ] 数据流清晰：组件间 props 向下、callback 向上？有没有绕过 props 直接改外部状态
- [ ] 最简实现（YAGNI）：删掉这层抽象会更简单吗？单人项目警惕为"未来可能"预留的代码

### B. 命名

- [ ] 函数动词开头：`parseX` / `computeX` / `simplifyX`
- [ ] 布尔值 is / has / can 前缀
- [ ] 名字与行为一致：叫 `prepareX` 的函数不该有写库副作用
- [ ] 领域缩写与既有代码一致（如 `ele`、`km`、`wp` 沿用 PoC 惯例），不新造无意义缩写
- [ ] 语言边界：代码与标识符英文，UI 文案与注释中文，没有混

### C. 函数逻辑

- [ ] 提前返回代替深嵌套
- [ ] 单一抽象层级：一个函数里不混 haversine 计算和 DOM 更新
- [ ] **边界条件**（地图类代码必查）：空数组、单点轨迹、海拔全缺失、零段轨迹、NaN 坐标
- [ ] 大循环纪律：10 万点量级的循环内没有不必要的对象分配 / 闭包创建
- [ ] 异步路径：每个 `await` 都有失败处理；async 函数没有裸调用（未 await 也未 catch）
- [ ] 资源对称：Leaflet layer、ResizeObserver、事件监听在组件卸载时都清理了吗

### D. 死代码与空链路

- [ ] 未被引用的 export / props / 分支已删（用 IDE 引用查找确认）
- [ ] 注释掉的代码、`console.log`、调试残留已清
- [ ] 每个 TODO 都挂着明确的后续事项（issue 或计划），不是空悬
- [ ] 空链路：catch 后吞错无任何用户可见反馈？if 两个分支结果相同？存在永远走不到的 return？
- [ ] 函数签名声明的参数 / 返回值全部真实使用

### E. Svelte / TypeScript 专项

- [ ] runes 纪律：`$derived` 只做纯计算；`$effect` 只做命令式副作用且依赖声明完整；能用 `$derived` 表达的不放 `$effect`
- [ ] `bind:this` 暴露的实例方法有明确类型接口（参照 `MapViewApi` 模式）
- [ ] 命令式 DOM 操作只发生在组件独占的子树（`<svg>`、地图容器），不碰 Svelte 模板管理的节点
- [ ] `any` / `as` 断言每一处都能说出理由，否则改成类型窄化
- [ ] 路由跳转用 `resolve()`（类型安全），不手写字符串路径

### F. 领域专项（本项目独有）

- [ ] **坐标系纪律**：一切轨迹数据 WGS-84；新增底图先确认坐标系（GCJ-02 底图会导致轨迹偏移几百米）
- [ ] KML 是**不可信输入**：任何进入 popup / innerHTML 的字符串必须过 `esc()`；改解析器时重读 `parser.ts` 顶部注释（正则安全性）
- [ ] IndexedDB：写操作走事务；按三仓粒度（tracks / trackData / files）读写，列表页不加载大数组
- [ ] 时间戳统一 epoch 毫秒；距离米、显示层才转 km

## 第三步：反馈标注（Conventional Comments）

review 意见（包括自我备注）用前缀分类，避免歧义：

| 标注        | 含义               | 是否阻塞合并 |
| ----------- | ------------------ | ------------ |
| `praise:`   | 值得保留的亮点     | 否           |
| `nitpick:`  | 小瑕疵，可改可不改 | 否           |
| `issue:`    | 必须修复的问题     | **是**       |
| `question:` | 存疑，需要讨论     | 视讨论结果   |

## 第四步：流程闭环

1. **写码时**：新文件落在正确的层；写完 `git diff` 自查一遍 D 节（死代码最容易残留）
2. **提 PR 前**：跑完第一节全部命令 + 过一遍清单
3. **PR 合并前**：在 PR 里按节留下结论（哪怕是 self-review 的 `nitpick` 备忘）
4. **定期回顾**：清单里某项连续多次没发现过问题 → 考虑自动化或删除；工具没拦住过的问题 → 加规则

## 参考

- [Google eng-practices — How to do a code review](https://google.github.io/eng-practices/review/)：业界事实标准，本流程的"原则"部分来源
- [Conventional Comments](https://conventionalcomments.org/)：review 反馈标注规范
- [Svelte 官方 Best Practices](https://svelte.dev/docs/svelte/best-practices)：runes 与性能建议
- [awesome-guidelines](https://github.com/Kristories/awesome-guidelines)：各语言风格指南汇总
