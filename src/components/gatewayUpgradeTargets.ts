/**
 * 「创建升级计划」页的目标确定口径（学 gateway-web 的「Agent 升级」，与那边同一套规则）。
 *
 * 灰度阶梯 / 阶段切分等**通用**口径在共享包 `@dayu-sec/wist-web-core`（`planPhases` /
 * `availablePhaseCounts`，中心与网关共用同一份）；本模块只保留这一页独有的
 * 「从网关机队里自动确定升级目标」。
 *
 * **不再让人逐个勾网关**：机队里排掉明确离线的，其余全部自动作为目标。理由与网关侧一致 ——
 * 离线的网关拉不到计划，把它排进金丝雀 / 批次只会把整段卡住（阶段永远不了结，推进被闸门挡住）。
 *
 * 为什么只排 `offline`、而不是「只留 online」：**未知 ≠ 离线**。中心的状态视图里可能出现非
 * `online` / `offline` 的取值（老网关自报别的词），把「不是 online」一律当离线扔掉，一次状态
 * 字段异常就会把整队目标筛空 —— 宁可把它算进目标，也别让计划悄悄少了人。
 */

/** 挑目标只需要这两列（`GatewayStatusView` 的最小子集）。 */
export interface UpgradeFleetGateway {
  gatewayId: string;
  status: string;
}

export interface GatewayUpgradeTargetSelection {
  /** 自动确定的目标（排除明确离线的，按 gateway_id 排序）。 */
  targetIds: string[];
  /** 机队台数（= 已接入并上报过、且未归档的网关，中心侧已按这两条筛过）。 */
  fleetSize: number;
  /** 被排除的离线台数。 */
  offlineCount: number;
}

/** 从机队里自动确定**升级目标**：把明确离线的排掉。 */
export function selectGatewayUpgradeTargets(
  gateways: readonly UpgradeFleetGateway[],
): GatewayUpgradeTargetSelection {
  const targetIds = gateways
    .filter((gateway) => gateway.status !== "offline")
    .map((gateway) => gateway.gatewayId)
    .sort();
  return {
    targetIds,
    fleetSize: gateways.length,
    offlineCount: gateways.length - targetIds.length,
  };
}
