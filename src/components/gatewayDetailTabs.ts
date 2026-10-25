// 网关详情页的分区（tab）口径 —— 纯逻辑，单独一处便于契约测试。
//
// 为什么分区：状态（只读）与绑定 / 体检重启 / 升级（动作）混在一页里，动手前得先滑过
// 整张性能卡。每个分区都是**独立路由**（`/gateways/:id/<tab>`），刷新 / 分享 / 后退
// 都能回到同一张页，而不是只靠组件内 state。

export type GatewayTab = "overview" | "binding" | "runtime" | "upgrade";

export interface GatewayTabItem {
  key: GatewayTab;
  label: string;
  /** 真实路由：概览就是详情页本身。 */
  to: string;
}

const TAB_SEGMENTS: GatewayTab[] = ["binding", "runtime", "upgrade"];

/** 路由 → 分区：`/gateways/:id/<tab>`，缺省或认不出的段一律回概览。 */
export function resolveGatewayTab(pathname: string): GatewayTab {
  const segment = pathname.split("/").filter(Boolean)[2];
  return TAB_SEGMENTS.includes(segment as GatewayTab)
    ? (segment as GatewayTab)
    : "overview";
}

/** tab 列表（顺序即页面顺序）。 */
export function gatewayTabs(base: string): GatewayTabItem[] {
  return [
    { key: "overview", label: "概览", to: base },
    { key: "binding", label: "绑定客户", to: `${base}/binding` },
    // 「运行时控制」= 体检 / 重启网关 / 重启 gwlinkd（远端下发，经中心命令队列）。
    { key: "runtime", label: "运行时控制", to: `${base}/runtime` },
    { key: "upgrade", label: "升级", to: `${base}/upgrade` },
  ];
}
