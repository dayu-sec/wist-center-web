# wist-center-web — WistCenter 全局控制中心前端

WistCenter 子系统的浏览器端 WEB 前端（Jumo `module<ui> InsightCenterWeb`，`target<site,web> center-web`）。承载网关列表/实例、初始配置、版本发布与升级计划页面。

## 页面

| 路由 | 页面 | 用例 |
|---|---|---|
| `/` | 网关态势（列表 + 全局概览） | ViewGatewayStatus |
| `/gateways/:gatewayId` | 网关详情（状态 / 生命周期 / Agent） | ViewGatewayStatus |
| `/instance` | 网关管理（实例总览 + 创建） | CreateGatewayInstance / BindGatewayCustomer |
| `/instance/:gatewayId` | 实例详情（接入材料 / 生命周期） | GetInitialConfig |
| `/packages` | 安装包管理（中心托管包列表 / 状态） | — |
| `/packages/add` | 安装包录入（按组件录入镜像制品） | — |
| `/release` | 发布计划 | PublishWistAgentd / PublishWarpGateWay |
| `/release/execute` | 发布执行（计划列表最多展示最新 5 条） | ApproveUpgradePlan |
| `/upgrade-plan` | 升级计划（旧地址，重定向到 `/release`） | CreateUpgradePlan |
| `/upgrade-plan/approve` | 旧地址，重定向到 `/release/execute` | ApproveUpgradePlan |

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

## 数据来源

- 页面通过 `AdminFacingInterface` 语义的 `/api/v1/admin/...` 管理接口消费数据。
- 后端 `wist-center`（原 warp-insight-center）尚未实现 HTTP 管理接口时，请求失败自动回退到内置
  example 数据（`source: "example"`），页面独立可渲染；接入真实后端后自动切换为
  `"real"`。填入 Admin Token 后开启 5s 轮询刷新。

## 视觉体系

风格与 `wist-gateway-web` 对齐，两边共用同一套设计令牌与组件语汇。

- **令牌**：`src/index.css` 是唯一事实来源，命名与取值均与 `wist-gateway-web/src/index.css`
  一致 —— 表面分层 `--bg/--surface/--surface-2/--surface-3`、文本四级
  `--text..--text-4`、品牌色 `--accent`（靛紫）、采集与健康语义
  `--ok/--warn/--crit/--unknown`、尺度 `--radius*/--shadow*/--ring`、外壳
  `--sidebar-width/--topbar-height/--content-max`。组件样式只允许引用令牌。
  **深色是默认，同时提供浅色主题**（见下）；随主题变的还有一组「叠加层 / 浮层」令牌
  （`--overlay* / --bar-bg / --panel-* / --scrim / --scrollbar-thumb*`），组件里不要写死颜色。
- **外壳**：`AppLayout` 提供左侧边栏（`GlobalTopNavigation`：品牌 + 导航 + 版本）+ 常驻状态条
  （`AppStatusBar`：面包屑 + 主题开关 + 轮询状态与新鲜度 + 刷新 + 管理令牌）+ 主内容区；
  各页面通过 `PageShell` 只负责页头与内容块，不再自行渲染导航。右半边与 `wist-gateway-web`
  **逐控件对齐**：刷新是图标按钮、状态与「多久以前同步的」同处一个胶囊（相对时间，绝对时刻进
  tooltip）、轮询卡住转琥珀色。**Admin Token 不在侧边栏了** —— 它是会话语境的凭证，挪到右上角
  状态条的钥匙按钮（`AdminTokenControl`，收起是按钮、点开是面板）。
- **内容块**：统一为 `width: calc(100% - 48px)` + `max-width: calc(var(--content-max) - 48px)`
  居中块（小屏 32px），块内需要内边距时用 `--radius` 面板承载，宽度里不重复叠加装订线。
- **读数**：所有 ID、版本、计数、指标数值用 `--font-mono` + `tabular-nums`，避免轮询刷新时列宽抖动。

## 主题（浅色 / 深色）

右上角状态条里有一个日/月图标开关：**首次进入跟随系统**（`prefers-color-scheme`），点过之后以你的
选择为准（存 `localStorage`，键 `wistCenterWeb.theme`）。取值与 `wist-gateway-web` 逐字一致，
两个控制台切过去是同一套观感。

- 两套配色都在 [`src/index.css`](src/index.css)：深色是默认（`:root`），浅色是 `:root[data-theme="light"]`
  的**覆盖**。切主题只改 `<html data-theme>` 一个属性 —— 颜色全走 CSS 变量，**不需要重挂载组件树**。
- ⚠️ **新增颜色 token 时两处都要加**：漏一处，浅色下那块就是深色的。`npm run test:theme` 会拦这件事，
  并且**顺带校验对比度**（正文 / 状态色 / 六色分类色板在两套主题下都要过 WCAG AA 4.5:1）。
- ⚠️ **组件 CSS 里不要写颜色字面量**：`#fff` 只该出现在**彩色底上的白字/白描边**（徽标、主按钮、品牌标）。
- 图表（`GatewayHistoryChart` 等）把颜色当 `var(--series-*)` 传进 SVG，切主题自动跟着变。

## 生成管线（可复现）

```bash
npx tsx generate.ts jumo-ui-model.json .   # 从 jumo-ui-model.json 生成骨架
```

`jumo-ui-model.json` 描述 UI 结构（对应 `WistCenter/layout.mju` 的区域与类型），
生成器产出 `src/types`、`src/store` 与组件骨架；页面设计在生成骨架上手工精修。
注意生成器会把 `.module.css` 一并覆盖为骨架样式，**精修后的样式表不要被重新生成冲掉** ——
重新生成后需逐文件核对 `src/components/*.module.css`。
