import {
  AGENT_PACKAGE_COMPONENTS,
  MANUAL_GATEWAY_UPGRADE_COMPONENTS,
  UPGRADE_COMPONENTS,
  manualUpgradeComponentLabel,
  normalizeReleaseVersion,
} from "../src/components/releaseComponents";
import { RELEASE_TARGETS } from "../src/components/packageTargets";

// 契约测试：发布页「发什么 / 谁决定升级」的组件清单。
//
// 这几条最容易漂移，而且漂了不会报错、只会表现为「页面里选不到某个组件」或
// 「中心越权决定 Agent 升级」：
//   1. ① 升级安装必须包含 `wist-gwlinkd`（自更新通道）；
//   2. `wist-agentd` 只能走 ②，绝不能回到 ①；
//   3. ① 里每个组件都必须在包管理里有对应的托管目标（否则选不到版本）；
//   4. 清单不得有重复项。
//
// Usage: npm run test:release-components

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const upgrade = [...UPGRADE_COMPONENTS];

assert(
  upgrade.includes("wist-gwlinkd"),
  "① 升级安装必须包含 wist-gwlinkd（宿主侧常驻自更新）",
);
assert(
  !upgrade.includes("wist-agentd"),
  "wist-agentd 只能走 ② Agent 包下发，不能出现在 ① 升级安装",
);
assert(
  AGENT_PACKAGE_COMPONENTS.length === 1 &&
    AGENT_PACKAGE_COMPONENTS[0] === "wist-agentd",
  `② 只发 wist-agentd：${AGENT_PACKAGE_COMPONENTS.join(",")}`,
);

assert(
  new Set(upgrade).size === upgrade.length,
  `① 组件清单不得重复：${upgrade.join(",")}`,
);
assert(
  new Set(AGENT_PACKAGE_COMPONENTS).size === AGENT_PACKAGE_COMPONENTS.length,
  `② 组件清单不得重复：${AGENT_PACKAGE_COMPONENTS.join(",")}`,
);

// ① 的每个组件都必须在包管理里可托管 —— 否则发布页的版本下拉永远是空的。
const managed = new Set(RELEASE_TARGETS.map((target) => target.component));
for (const component of UPGRADE_COMPONENTS) {
  assert(managed.has(component), `包管理缺少 ① 组件 ${component} 的托管目标`);
}
for (const component of AGENT_PACKAGE_COMPONENTS) {
  assert(managed.has(component), `包管理缺少 ② 组件 ${component} 的托管目标`);
}

// gwlinkd 是多平台组件（宿主侧按平台取件）：发布页一次必须录满三平台。
const gwlinkd = RELEASE_TARGETS.find(
  (target) => target.component === "wist-gwlinkd",
);
assert(gwlinkd !== undefined, "包管理缺少 wist-gwlinkd 目标");
assert(
  gwlinkd?.platforms?.length === 3,
  `wist-gwlinkd 必须是三平台目标，实际 ${gwlinkd?.platforms?.length ?? 0}`,
);

// gateway-stack 是单制品（包名无 target-triple），不应带平台槽位。
const stack = RELEASE_TARGETS.find(
  (target) => target.component === "wist-gateway-stack",
);
assert(stack !== undefined, "包管理缺少 wist-gateway-stack 目标");
assert(
  stack?.platforms === undefined,
  "wist-gateway-stack 是单制品，不应带 platforms",
);

// 网关详情页「手动升级」只开放 gwlink + gateway-stack，且两者必须也在 ① 里。
assert(
  MANUAL_GATEWAY_UPGRADE_COMPONENTS.length === 2 &&
    MANUAL_GATEWAY_UPGRADE_COMPONENTS.includes("wist-gwlinkd") &&
    MANUAL_GATEWAY_UPGRADE_COMPONENTS.includes("wist-gateway-stack"),
  `手动升级组件应为 gwlinkd + gateway-stack：${MANUAL_GATEWAY_UPGRADE_COMPONENTS.join(",")}`,
);
for (const component of MANUAL_GATEWAY_UPGRADE_COMPONENTS) {
  assert(
    upgrade.includes(component),
    `手动升级组件 ${component} 必须同时是 ① 升级组件`,
  );
}

// 展示名保留中心组件名，同时给出用户常用简称。
assert(
  manualUpgradeComponentLabel("wist-gwlinkd").includes("gwlink"),
  manualUpgradeComponentLabel("wist-gwlinkd"),
);
assert(
  manualUpgradeComponentLabel("wist-gateway-stack").includes("gateway-stack"),
  manualUpgradeComponentLabel("wist-gateway-stack"),
);

// 版本 / 命名归一化：去空白 + 去前导 v/V；其余原样。
assert(
  normalizeReleaseVersion("  v0.12.0-alpha  ") === "0.12.0-alpha",
  normalizeReleaseVersion("  v0.12.0-alpha  "),
);
assert(
  normalizeReleaseVersion("V0.12.0-alpha") === "0.12.0-alpha",
  normalizeReleaseVersion("V0.12.0-alpha"),
);
assert(
  normalizeReleaseVersion("0.12.0-alpha") === "0.12.0-alpha",
  normalizeReleaseVersion("0.12.0-alpha"),
);

console.log("release components: OK");
