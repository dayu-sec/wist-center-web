# 更新日志

本文件记录 `wist-center-web` 的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 说明：0.1.3 之前未单独维护本文件；自 0.1.3 起记录。

## [0.1.3-alpha] - 2026-10-04

### 变更
- **网关接入指引措辞对齐 mTLS**：创建面板与详情页说明「宿主侧 `wist-gwlinkd` 首跑接入 → register
  换取**客户端证书**（mTLS）」；注明控制中心 CA 证书是 **CA-S 信任锚**、作 gwlinkd 的 `trust_bundle`。

### 修复
- **初始配置表单字段**：`instanceId` → `gatewayId`，与后端 `GetGatewayInitialConfigCommand { gatewayId }` 对齐。
- **开发代理**：`/api` 代理接受**自签证书**（中心以自签 HTTPS 起时 dev 可连通）。
