# 更新日志

本文件记录 `wist-center-web` 的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.3 之前未单独维护本文件；自 0.1.3 起记录。

## [0.1.7-alpha] - 2026-10-06

### 变更
- **发布 ①「升级安装」的灰度阶段改为自动生成**（对齐 gateway-web 的「Agent 升级」口径）：
  不再手加步骤 + 逐个勾网关；只选**阶段数**（2/3/4/5，按所选网关数收窄），网关按固定阶梯
  **1 台（金丝雀）→ 10% → 30% → 70% → 全量** 自动切片、互不重叠（一个网关只升一次）；
  页面给阶段预览（金丝雀 / 覆盖% / 新增数），提交时折算成计划步骤。**推进仍人工确认**。
- 网关范围加「全选 / 清空」。
- 新增 `rolloutPhases.ts`（与 gateway-web `agentUpgradePhases.ts` 同口径）。

## [0.1.6-alpha] - 2026-10-06

### 变更
- **网关展示对外域名**：实例卡片与详情展示网关上报的「域名」（`public_base_url`）；老后端不带时为 `—`。
- **「包管理」与「发布」拆成两页**（对齐 gateway-web 的「安装包 / 升级」）：
  - **包管理** `/packages`：中心**托管**的安装包 —— 4 个独立组件
    （`wist-gateway-stack` / `wist-agentd` / `galaxy-ops` / `galaxy-flow`）各自的录入来源、当前与历史。
  - **发布** `/release`：把包装出去，**两种**（区别在「谁决定升级」）——
    ① **升级安装**：`wist-gateway-stack` / `galaxy-ops` / `galaxy-flow` 推到网关升级（中心决定）；
    ② **Agent 包下发**：`wist-agentd` 推到网关的**包管理**，是否升级由网关决定（*后端待接通，执行者为 gwlinkd*）。
  - 旧入口 `/upgrade-plan` 重定向到 `/release`；批准入口仍在 `/upgrade-plan/approve`。
- **包管理目标从 2 个扩到 4 个独立组件**：两份重复的面板泛化为一个通用 `PackagePanel`（按 `PackageTarget` 实例化），
  以后再加组件只需加一条目标。
- **网关组件名统一为 `wist-gateway-stack`**：包管理页、升级计划（① 升级安装）页的组件选项与示例数据从 `wist-gateway`
  改为 `wist-gateway-stack`，与中心实际托管的部署包同名（升级计划按 `component` 反查 release 才能命中）。
- **① 升级安装的组件收敛为 `wist-gateway-stack` / `galaxy-ops` / `galaxy-flow`**：`wist-agentd` 不再作为
  升级计划目标（它走 ②，由网关决定升级）。
- **「包管理」不再手输版本号**：提交表单只填**产物地址**（+ 可选期望摘要）；版本号从包地址自动解析，
  并在提交按钮旁**实时预览**「将录入版本 v…」。真解析在中心侧，表单预览只是同一套规则的轻量版。
- **包管理页文案去「发布」**：按钮「提交」、状态 `published` → 「已录入」、区块「最近录入」
  —— 因为「发布」现在是另一页（把包装出去），包管理只负责录入/托管。
- **提交成功后清空表单**（产物地址 + 期望摘要），回执仍留在下方，避免把上一次的表单再交一遍。
- **提交不再回落示例**：`publishRelease` 是**写操作**，改为只认真实响应（示例回执曾把一个 `422`
  伪装成成功卡，看着像提交了、其实什么也没落）；真实失败让它冒出来（与 `rotateGatewayLinkToken` 同一取舍）。
- **发布页加「期望摘要（可选）」**：所有发布目标都可填一个可选的 `sha256` 输入
  （可带 `sha256:` 前缀），交中心核对读到的制品字节；留空则只记录算出的摘要。

### 修复
- **网关详情页趋势图分块**：负载（1m）与富化趋势图不再挤在同一行，改为两个独立图表块。

## [0.1.5-alpha] - 2026-10-05

### 变更
- **网关详情页趋势图扩展**：「最近 1 小时」在 CPU / 内存 / 在线之外，新增**运行时长 / 在线 Agent /
  上报时延 / 存储 / 负载 1m / 磁盘**趋势行（对齐后端富化指标进 VictoriaMetrics）；**该序列有数据才显示**
  （老数据 / Agent 紧凑图不出现空行）。
- **dev 代理自动带 admin token**：开发态 vite 代理从中心配置（`~/.wist-center/wist-center.toml`，可用
  `WIST_CENTER_CONFIG` 覆盖）读 admin token，在请求**未带** `Authorization` 时补上——前端不再因缺 token 而
  静默回落到「示例数据」（假实例 / 假接入链接）。token 不进前端包；已手填的优先（不覆盖）。

### 修复
- **「连接 Gateway」不再用示例数据伪造接入链接**：签发接入券（`rotateGatewayLinkToken`）改为**只认后端真实响应**——
  此前后端不可达或实例不存在时会静默回落到内置示例，生成一条 `http://`、**无 CA** 的假接入链接（与真实链接无从区分）。
- **示例数据显式标记**：实例列表与详情页在示例态显示「示例」提示，且详情页在示例态**禁用**「生成/轮换接入券」。
- **「未找到该网关实例」可一键创建**：详情页对不存在的 `gatewayId` 提供「创建网关实例」按钮，避免死路。

## [0.1.4-alpha] - 2026-10-05

### 变更
- **「连接 Gateway」对齐新流程**：创建回执**不再给接入凭据/接入物**（只给实例）；接入统一收敛到实例详情页
  「连接 Gateway」——页面按**两步**重排：① 生成/轮换**一次性、短命**的接入券（刷新即丢，再取即轮换，并显示有效期）；
  ② 生成**一条接入链接**（含中心地址 + 接入券 + CA 信任锚）交给你，粘到**本机网关**的「链接上级」页。不再展示 `gwlinkd.toml`
  与宿主 CLI 启动命令 —— 接入由宿主侧 `wist-gwlinkd` 环回网关拉取接入物后自动完成（link-upstream → register）。
- **接入券改名（bootstrap → link）**：Admin API `rotateGatewaySetupToken` → `rotateGatewayLinkToken`，
  路由 `…/setup-token` → `…/link-token`，字段 `setupToken` / `bootstrapExpiresAt` → `linkToken` / `linkExpiresAt`。

## [0.1.3-alpha] - 2026-10-04

### 变更
- **网关接入指引措辞对齐 mTLS**：创建面板与详情页说明「宿主侧 `wist-gwlinkd` 首跑接入 → register
  换取**客户端证书**（mTLS）」；注明控制中心 CA 证书是 **CA-S 信任锚**、作 gwlinkd 的 `trust_bundle`。

### 修复
- **初始配置表单字段**：`instanceId` → `gatewayId`，与后端 `GetGatewayInitialConfigCommand { gatewayId }` 对齐。
- **开发代理**：`/api` 代理接受**自签证书**（中心以自签 HTTPS 起时 dev 可连通）。
