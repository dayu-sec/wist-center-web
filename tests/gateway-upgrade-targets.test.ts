import { selectGatewayUpgradeTargets } from "../src/components/gatewayUpgradeTargets";

// 契约测试：建升级计划时**目标怎么确定**（与 gateway-web 的「Agent 升级」同一套口径）。
//
// 这不是「顺手写的工具函数」—— 它是「谁会被升级」的唯一裁决点，三件事最容易漂移：
//   1. **只排明确离线**（`status === "offline"`）：未知 ≠ 离线。中心状态视图里可能出现非
//      online/offline 的取值（老网关自报别的词），把「不是 online」一律当离线会一次筛空目标；
//   2. **排序**：阶段按 `gateway_id` 排序切片（金丝雀取第一台），顺序不稳 = 每批的人会变，
//      于是计划回执、审计读起来都不是同一件事；
//   3. **计数**：机队台数 / 被排除台数要说得出（页面拿它解释「为什么只有 N 台」）。
//
// Usage: npm run test:gateway-targets

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const fleet = [
  { gatewayId: "gw-003", status: "online" },
  { gatewayId: "gw-001", status: "offline" },
  { gatewayId: "gw-002", status: "online" },
  { gatewayId: "gw-004", status: "unknown" }, // 老网关自报的第三种取值：**不能**当离线
];

const picked = selectGatewayUpgradeTargets(fleet);

assert(
  picked.targetIds.join(",") === "gw-002,gw-003,gw-004",
  `排除明确离线、按 id 排序：${picked.targetIds.join(",")}`,
);
assert(
  !picked.targetIds.includes("gw-001"),
  "明确离线的网关不进目标（拉不到计划，会把阶段卡死）",
);
assert(
  picked.targetIds.includes("gw-004"),
  "认不出的状态保留（未知 ≠ 离线），否则一次状态异常就筛空目标",
);
assert(picked.fleetSize === 4, `机队台数 = 4，实际 ${picked.fleetSize}`);
assert(picked.offlineCount === 1, `排除台数 = 1，实际 ${picked.offlineCount}`);

// 全离线：目标为空（页面据此禁用提交并说明原因），但机队台数照旧。
const allOffline = selectGatewayUpgradeTargets([
  { gatewayId: "gw-001", status: "offline" },
  { gatewayId: "gw-002", status: "offline" },
]);
assert(allOffline.targetIds.length === 0, "全离线时目标为空");
assert(
  allOffline.fleetSize === 2 && allOffline.offlineCount === 2,
  "全离线时计数仍要说清机队与排除数",
);

// 空机队：三个值都给得出（页面显示「暂无已接入的网关」而不是崩）。
const empty = selectGatewayUpgradeTargets([]);
assert(
  empty.targetIds.length === 0 && empty.fleetSize === 0 && empty.offlineCount === 0,
  "空机队要给出空结果而不是 NaN",
);

// 不修改入参：调用方拿的是 React 查询缓存里的数组，就地排序会污染缓存。
const before = fleet.map((gateway) => gateway.gatewayId).join(",");
selectGatewayUpgradeTargets(fleet);
assert(
  fleet.map((gateway) => gateway.gatewayId).join(",") === before,
  "不得就地排序 / 改写入参",
);

console.log("gateway upgrade targets: OK");
