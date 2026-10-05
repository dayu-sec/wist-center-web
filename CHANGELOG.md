# 更新日志

本文件记录 `wist-center-web` 的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.3 之前未单独维护本文件；自 0.1.3 起记录。

## [Unreleased]

### 修复
- **「连接 Gateway」不再用示例数据伪造接入链接**：签发接入券（`rotateGatewayLinkToken`）改为**只认后端真实响应**——
  此前后端不可达或实例不存在时会静默回落到内置示例，生成一条 `http://`、**无 CA** 的假接入链接（与真实链接无从区分）。
- 示例数据现在**显式标记**：实例列表与详情页在示例态显示「示例」提示，且详情页在示例态**禁用**「生成/轮换接入券」。

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
