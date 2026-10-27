import {
  selectGatewayUpgradeTargets,
  targetsMissingVersion,
  toggleGatewayTarget,
} from "../src/components/gatewayUpgradeTargets";

// 契约测试：发布计划的「目标网关」选择。
//
// 发布范围从「全自动全选」改成「默认全选在线 + 可逐台改」，这里锁住口径别漂：
//   1. 默认只排 `offline`；**未知状态不算离线**（老网关自报别的词时不能把目标筛空）；
//   2. 默认结果按 gateway_id 排序（金丝雀是哪一台，预览与执行必须一致）；
//   3. 勾选 / 取消是**纯函数**，不改入参、结果始终有序、重复取消是幂等的；
//   4. 灰度阶段在「选中范围」内切分，所以选中 0 台要能被上层判为不可提交。
//
// Usage: npm run test:gateway-targets

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const fleet = [
  { gatewayId: "gw-c", status: "online" },
  { gatewayId: "gw-a", status: "online" },
  { gatewayId: "gw-b", status: "offline" },
  { gatewayId: "gw-d", status: "stale" },
];

// --- 1. 默认口径 -----------------------------------------------------------
const defaults = selectGatewayUpgradeTargets(fleet);
assert(defaults.fleetSize === 4, `fleetSize 应为 4：${defaults.fleetSize}`);
assert(defaults.offlineCount === 1, `offlineCount 应为 1：${defaults.offlineCount}`);
assert(
  JSON.stringify(defaults.targetIds) === JSON.stringify(["gw-a", "gw-c", "gw-d"]),
  `默认目标不对（应排除 gw-b 且排序）：${JSON.stringify(defaults.targetIds)}`,
);
assert(
  !defaults.targetIds.includes("gw-b"),
  "明确离线的网关默认不能进目标",
);
assert(
  defaults.targetIds.includes("gw-d"),
  "未知状态（stale）不能当成离线被筛掉",
);

// --- 2. 勾选 / 取消 --------------------------------------------------------
const original = ["gw-a", "gw-c"];
const removed = toggleGatewayTarget(original, "gw-a");
assert(
  JSON.stringify(removed) === JSON.stringify(["gw-c"]),
  `取消后应只剩 gw-c：${JSON.stringify(removed)}`,
);
assert(
  JSON.stringify(original) === JSON.stringify(["gw-a", "gw-c"]),
  "toggleGatewayTarget 不能改动入参",
);

const added = toggleGatewayTarget(original, "gw-b");
assert(
  JSON.stringify(added) === JSON.stringify(["gw-a", "gw-b", "gw-c"]),
  `加回离线网关后仍要排序：${JSON.stringify(added)}`,
);

const twice = toggleGatewayTarget(removed, "gw-a");
assert(
  JSON.stringify(twice) === JSON.stringify(["gw-a", "gw-c"]),
  "取消再加回应回到原集合",
);

assert(
  JSON.stringify(toggleGatewayTarget(["gw-a"], "gw-a")) === "[]",
  "取消最后一台应得到空集合（上层据此禁提交）",
);

// --- 3. 版本必填 -----------------------------------------------------------
const missing = targetsMissingVersion([
  { component: "wist-gateway-stack", targetVersion: "" },
  { component: "galaxy-ops", targetVersion: "0.4.0" },
  { component: "wist-gateway-stack", targetVersion: " " },
]);
assert(
  JSON.stringify(missing) === JSON.stringify(["wist-gateway-stack"]),
  `未选版本的组件应去重列出：${JSON.stringify(missing)}`,
);
assert(
  targetsMissingVersion([
    { component: "wist-gateway-stack", targetVersion: "0.2.0" },
  ]).length === 0,
  "都选了版本时不应报缺版本",
);

console.log("gateway target selection: OK");
