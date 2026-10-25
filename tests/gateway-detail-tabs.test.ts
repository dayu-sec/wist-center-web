import {
  gatewayTabs,
  resolveGatewayTab,
} from "../src/components/gatewayDetailTabs";

// 契约测试：网关详情页的分区（tab）口径。
//
// 锁两件事：
//   1. **路由是唯一真相**：`/gateways/X4/runtime` 这种链接刷新/分享后必须还是那个分区，
//      认不出的段不能把人挡在白屏 —— 回概览；
//   2. 「运行时控制」**必须是独立分区**，且绑定/升级各自一格（现场反馈：动作挤在状态页里，
//      动手前得先滑过整张性能卡）。
//
// Usage: npm run test:gateway-detail-tabs

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 1) 路由 → 分区
const cases: [string, string][] = [
  ["/gateways/X4", "overview"],
  ["/gateways/X4/", "overview"],
  ["/gateways/X4/binding", "binding"],
  ["/gateways/X4/runtime", "runtime"],
  ["/gateways/X4/upgrade", "upgrade"],
  // 认不出的尾段（手改 URL / 老书签）回概览，不能留白。
  ["/gateways/X4/whatever", "overview"],
  ["/", "overview"],
];
for (const [pathname, expected] of cases) {
  assert(
    resolveGatewayTab(pathname) === expected,
    `${pathname} 应落到 ${expected}，实际 ${resolveGatewayTab(pathname)}`,
  );
}

// 2) tab 列表：四格、顺序固定、路由 = 详情页 + 尾段
const tabs = gatewayTabs("/gateways/X4");
assert(tabs.length === 4, `应有 4 个分区，实际 ${tabs.length}`);
assert(
  tabs.map((item) => item.key).join(",") === "overview,binding,runtime,upgrade",
  "分区顺序变了（概览 → 绑定客户 → 运行时控制 → 升级）",
);
assert(
  tabs.find((item) => item.key === "runtime")?.label === "运行时控制",
  "「运行时控制」必须是一个独立分区",
);
assert(
  tabs.find((item) => item.key === "overview")?.to === "/gateways/X4",
  "概览就是详情页本身（不能拼成 /overview）",
);
for (const item of tabs) {
  assert(
    item.to.startsWith("/gateways/X4"),
    `${item.key} 的路由必须挂在网关详情下：${item.to}`,
  );
  if (item.key !== "overview") {
    assert(
      resolveGatewayTab(item.to) === item.key,
      `${item.to} 与分区 ${item.key} 不自洽`,
    );
  }
}

console.log("gateway detail tabs contract: OK");
