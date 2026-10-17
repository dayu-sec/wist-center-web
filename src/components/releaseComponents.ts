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
