// Agent 详情的地址口径 —— 纯逻辑，单独一处便于契约测试。
//
// 与网关分区 tab 同一原则：详情是**独立路由**，刷新 / 分享 / 后退都能回到同一台 Agent，
// 而不是只靠组件内 state。两段 id 都来自接口（可能含 `/`、`%` 之类），一律编码。

/** Agent 状态页（承载 Agent 列表的那一层）。 */
export function agentListPath(gatewayId: string): string {
  return `/gateways/${encodeURIComponent(gatewayId)}/agents`;
}

/** `/gateways/:gatewayId/agents/:agentId` —— 单台 Agent 的详情（采集授权 / 调查数据）。 */
export function agentDetailPath(gatewayId: string, agentId: string): string {
  return `${agentListPath(gatewayId)}/${encodeURIComponent(agentId)}`;
}
