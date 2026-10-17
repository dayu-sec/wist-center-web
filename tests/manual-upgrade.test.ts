import { buildUpgradeScriptRequest } from "../src/manualUpgrade";
import { MANUAL_GATEWAY_UPGRADE_COMPONENTS } from "../src/components/releaseComponents";

// 契约测试：网关详情页「手动升级」生成的**脚本请求**。
//
// 这里刻意不建计划 / 不下发任务，只把「组件 + 版本命名」归一成中心端点要的形状：
//   1. 组件接受中心名与页面简称（gwlink / gateway-stack）；
//   2. 版本统一去 `v` 前缀；
//   3. 空网关 / 空版本 / 不支持的组件当场拒绝（不把明显错误发到中心）。
//
// Usage: npm run test:manual-upgrade

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

for (const component of MANUAL_GATEWAY_UPGRADE_COMPONENTS) {
  const request = buildUpgradeScriptRequest({
    gatewayId: " X4 ",
    component,
    version: "  v0.12.0-alpha ",
  });
  assert(request.gatewayId === "X4", `gatewayId: ${request.gatewayId}`);
  assert(request.component === component, `component: ${request.component}`);
  assert(request.version === "0.12.0-alpha", `version: ${request.version}`);
}

// 页面简称 → 中心组件名（与中心 `/upgrade-script` 端点同一套别名）。
const gwlink = buildUpgradeScriptRequest({
  gatewayId: "X4",
  component: "gwlink",
  version: "0.12.0-alpha",
});
assert(gwlink.component === "wist-gwlinkd", `gwlink: ${gwlink.component}`);
const stack = buildUpgradeScriptRequest({
  gatewayId: "X4",
  component: "gateway-stack",
  version: "0.14.0",
});
assert(
  stack.component === "wist-gateway-stack",
  `gateway-stack: ${stack.component}`,
);

function expectThrow(fn: () => void, includes: string): void {
  let message = "";
  try {
    fn();
  } catch (err) {
    message = String(err);
  }
  assert(
    message.includes(includes),
    `expected ${JSON.stringify(includes)}, got ${message}`,
  );
}

expectThrow(
  () =>
    buildUpgradeScriptRequest({
      gatewayId: "X4",
      component: "gwlink",
      version: " v ",
    }),
  "版本不能为空",
);
expectThrow(
  () =>
    buildUpgradeScriptRequest({
      gatewayId: "  ",
      component: "gwlink",
      version: "0.12.0-alpha",
    }),
  "gatewayId",
);
expectThrow(
  () =>
    buildUpgradeScriptRequest({
      gatewayId: "X4",
      component: "wist-agentd",
      version: "0.1.0",
    }),
  "不支持的升级组件",
);
expectThrow(
  () =>
    buildUpgradeScriptRequest({
      gatewayId: "X4",
      component: "  ",
      version: "0.12.0-alpha",
    }),
  "组件不能为空",
);

console.log("manual upgrade: OK");
