/**
 * 发布页的组件清单（纯数据，不引 React —— 供页面与契约测试共用）。
 *
 * 两种「发出去」的区别在**谁决定升级**：
 * - ① 升级安装：中心决定，推到网关（宿主侧）安装；
 *   `wist-gwlinkd` 由宿主侧常驻**自更新**（覆盖自己的二进制，重启后核对版本回执）。
 * - ② Agent 包下发：只把包交给网关的包管理，升不升由网关决定。
 *
 * 这里只列 ①；`wist-agentd` 走 ②，**不得**回到 ①（否则中心会越权决定 Agent 升级）。
 */
export const UPGRADE_COMPONENTS = [
  "wist-gateway-stack",
  "galaxy-ops",
  "galaxy-flow",
  "wist-gwlinkd",
] as const;

/** ②「Agent 包下发」只发这一个组件。 */
export const AGENT_PACKAGE_COMPONENTS = ["wist-agentd"] as const;

/**
 * 网关详情页「手动升级」可选的组件。
 *
 * 只开放宿主侧这两个：
 * - `wist-gwlinkd`（gwlink）：宿主侧接入器，自更新后由服务管理器拉起；
 * - `wist-gateway-stack`：网关运行时，由 gwlinkd 驱动 gops 升级（会重建网关）。
 *
 * 不把 `galaxy-ops` / `galaxy-flow` 放进这里：它们通常跟栈一起升，逐台单独升工具需要
 * 更明确的现场判断；需要时仍可在「发布」页走批量计划。
 */
export const MANUAL_GATEWAY_UPGRADE_COMPONENTS = [
  "wist-gwlinkd",
  "wist-gateway-stack",
] as const;

/** 手动升级里的展示名（保留中心组件名，同时给出用户常用的简称）。 */
export function manualUpgradeComponentLabel(component: string): string {
  switch (component) {
    case "wist-gwlinkd":
      return "wist-gwlinkd（gwlink）";
    case "wist-gateway-stack":
      return "wist-gateway-stack（gateway-stack）";
    default:
      return component;
  }
}

/**
 * 版本 / 命名归一化：去空白 + 去前导 `v` / `V`。
 *
 * 中心 release 记录里的版本通常不带 `v`（如 `0.12.0-alpha`），而运维手敲 tag 时常带
 * `v0.12.0-alpha`；归一化后两边都能命中同一条发布记录。
 */
export function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^[vV]/, "");
}
