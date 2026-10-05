# 更新日志

本文件记录 `wist-center-web` 的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.3 之前未单独维护本文件；自 0.1.3 起记录。

## [Unreleased]

### 变更
- **「连接 Gateway」对齐设计**：创建回执**不再给接入凭据/接入物**（只给实例）；接入统一收敛到实例详情页
  「连接 Gateway」——「生成/轮换接入券」产出**一次性、短命**的接入券，并一次性展示 Center 接入地址、
  CA 信任锚、`gwlinkd.toml` 与宿主启动命令（刷新即丢；再取即轮换），同时展示接入券**有效期**。
- **接入券改名（bootstrap → link）**：Admin API `rotateGatewaySetupToken` → `rotateGatewayLinkToken`，
  路由 `…/setup-token` → `…/link-token`，字段 `setupToken` / `bootstrapExpiresAt` → `linkToken` / `linkExpiresAt`；
  宿主侧启动命令改为 `WIST_GWLINKD_LINK_TOKEN=… wist-gwlinkd run`。

## [0.1.3-alpha] - 2026-10-04

### 变更
- **网关接入指引措辞对齐 mTLS**：创建面板与详情页说明「宿主侧 `wist-gwlinkd` 首跑接入 → register
  换取**客户端证书**（mTLS）」；注明控制中心 CA 证书是 **CA-S 信任锚**、作 gwlinkd 的 `trust_bundle`。

### 修复
- **初始配置表单字段**：`instanceId` → `gatewayId`，与后端 `GetGatewayInitialConfigCommand { gatewayId }` 对齐。
- **开发代理**：`/api` 代理接受**自签证书**（中心以自签 HTTPS 起时 dev 可连通）。
