# wist-center-web — WarpInsightCenter 全局控制中心前端

WarpInsightCenter 子系统的浏览器端 WEB 前端（Jumo `module<ui> InsightCenterWeb`，`target<site,web> center-web`）。承载网关列表/实例、初始配置、版本发布与升级计划页面。

## 页面

| 路由 | 页面 | 用例 |
|---|---|---|
| `/` | 网关态势（列表 + 全局概览） | ViewGatewayStatus |
| `/gateways/:gatewayId` | 网关详情（状态 / 生命周期 / Agent） | ViewGatewayStatus |
| `/instance` | 网关管理（实例总览 + 创建） | CreateGatewayInstance / BindGatewayCustomer |
| `/instance/:gatewayId` | 实例详情（接入材料 / 生命周期） | GetInitialConfig |
| `/release` | 版本发布 | PublishWistAgentd / PublishWarpGateWay |
| `/upgrade-plan` | 升级计划 | CreateUpgradePlan |
| `/upgrade-plan/approve` | 批准升级计划 | ApproveUpgradePlan |

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
  **暗色是唯一形态**，不再提供浅色派生。
- **外壳**：`AppLayout` 提供左侧边栏（`GlobalTopNavigation`）+ 常驻状态条
  （`AppStatusBar`：面包屑 / 轮询状态 / 最近同步 / 版本 / 刷新）+ 主内容区；
  各页面通过 `PageShell` 只负责页头与内容块，不再自行渲染导航。
- **内容块**：统一为 `width: calc(100% - 48px)` + `max-width: calc(var(--content-max) - 48px)`
  居中块（小屏 32px），块内需要内边距时用 `--radius` 面板承载，宽度里不重复叠加装订线。
- **读数**：所有 ID、版本、计数、指标数值用 `--font-mono` + `tabular-nums`，避免轮询刷新时列宽抖动。

## 生成管线（可复现）

```bash
npx tsx generate.ts jumo-ui-model.json .   # 从 jumo-ui-model.json 生成骨架
```

`jumo-ui-model.json` 描述 UI 结构（对应 `WarpInsightCenter/layout.mju` 的区域与类型），
生成器产出 `src/types`、`src/store` 与组件骨架；页面设计在生成骨架上手工精修。
注意生成器会把 `.module.css` 一并覆盖为骨架样式，**精修后的样式表不要被重新生成冲掉** ——
重新生成后需逐文件核对 `src/components/*.module.css`。
