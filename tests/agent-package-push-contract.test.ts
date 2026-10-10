import {
  AGENT_PACKAGE_PUSH_ACTION,
  advanceUpgradePlan,
  approveUpgradePlan,
  createUpgradePlan,
  fetchUpgradePlan,
  fetchUpgradePlans,
  jsonUpgradeSpec,
  setAdminApiToken,
} from "../src/api/admin";

// 契约测试：发布 ②「Agent 包下发」（中心侧）的**线上契约**。
//
// ② 不新增端点：复用通用灰度发布计划（`Control.Rollout`），只差 `action = push-agent-package`。
// 面板（`AgentPackagePushPanel`）经 `createUpgradePlan` 提交；批准 / 推进 / 逐台进度复用
// 「发布执行」页（对 ①/② 计划一视同仁）。这里锁住六件最容易漂移的事：
//   1. 动作字面量：与 Rust `wist_control::ACTION_PUSH_AGENT_PACKAGE` 同值（web 侧钉一手）；
//   2. `spec` 拼装：单组件 `wist-agentd` + 版本 → `{"targets":[{"component","target_version"}]}`；
//   3. 创建 body 字段名（`action`/`spec`/`target_ids`/`phase_count`/`deadline_at`/`timeout_seconds`/`batch_size`）；
//   4. 读回：列表 / 详情的归一化（② 计划与 ① 同形，`action` 原样带出）；
//   5. 批准 / 推进的线上契约（路径 / 方法 / body / bearer）；
//   6. 写操作**不回落示例**：失败必须抛错，不得伪装成成功回执。
//
// Usage: npm run test:agent-package-push

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

interface Recorded {
  url: string;
  method: string;
  authorization: string;
  body: string;
}

let recorded: Recorded[] = [];
let responder: () => Response = () => Response.json({});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  recorded.push({
    url: input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
    authorization: headers.get("authorization") ?? "",
    body: typeof init?.body === "string" ? init.body : "",
  });
  return responder();
};

setAdminApiToken("admin-token-under-test");

// --- 1. 动作字面量：与 Rust 侧同值 ------------------------------------------
assert(
  AGENT_PACKAGE_PUSH_ACTION === "push-agent-package",
  "action 必须是 push-agent-package（与 wist_control::ACTION_PUSH_AGENT_PACKAGE 同值）",
);

// --- 2. spec 拼装 -----------------------------------------------------------
const spec = jsonUpgradeSpec([
  { component: "wist-agentd", targetVersion: "0.1.9" },
]);
assert(
  spec === '{"targets":[{"component":"wist-agentd","target_version":"0.1.9"}]}',
  `spec 形状不对：${spec}`,
);
// 版本留空 → 不写 `target_version`（② 里版本必填，这里钉住拼装口径本身）。
const blank = jsonUpgradeSpec([{ component: "wist-agentd", targetVersion: "  " }]);
assert(
  blank === '{"targets":[{"component":"wist-agentd"}]}',
  `空版本不该写出 target_version：${blank}`,
);

// --- 3. 创建：路径 / 方法 / bearer / body 字段名 -----------------------------
recorded = [];
responder = () =>
  Response.json({
    plan_id: "plan-push-1",
    action: "push-agent-package",
    spec,
    deadline_at: "2026-10-10T00:00:00Z",
    timeout_seconds: 600,
    phases: [
      {
        phase_index: 1,
        target_ids: ["gw-1"],
        advance_rule: "manual",
        status: "pending",
      },
    ],
    batch_size: 0,
    current_phase: 0,
    status: "draft",
    created_by: "admin",
    created_at: "2026-10-09T00:00:00+00:00",
    approved_by: null,
    approved_at: null,
  });

const created = await createUpgradePlan({
  action: AGENT_PACKAGE_PUSH_ACTION,
  spec,
  targetIds: ["gw-1", "gw-2"],
  phaseCount: 1,
  deadlineAt: "2026-10-10T00:00:00Z",
  timeoutSeconds: 600,
  batchSize: 0,
});

assert(recorded[0].url === "/api/v1/admin/rollout-plans", "create 路径");
assert(recorded[0].method === "POST", "create 必须 POST");
assert(
  recorded[0].authorization === "Bearer admin-token-under-test",
  "create 带 admin bearer",
);
const body = JSON.parse(recorded[0].body);
assert(body.action === "push-agent-package", "body.action");
assert(
  JSON.parse(body.spec).targets[0].component === "wist-agentd",
  "body.spec.targets[0].component",
);
assert(
  JSON.parse(body.spec).targets[0].target_version === "0.1.9",
  "body.spec.targets[0].target_version",
);
assert(
  Array.isArray(body.target_ids) && body.target_ids.join(",") === "gw-1,gw-2",
  "body.target_ids（阶段由服务端切）",
);
assert(body.phase_count === 1, "body.phase_count");
assert(body.deadline_at === "2026-10-10T00:00:00Z", "body.deadline_at");
assert(body.timeout_seconds === 600, "body.timeout_seconds");
assert(body.batch_size === 0, "body.batch_size");
assert(body.phases === undefined, "客户端不自己切阶段，body 里不该有 phases");
assert(created.source === "real", "create 应取真实回执");
assert(created.data.action === "push-agent-package", "回执带 action");
assert(created.data.planId === "plan-push-1", "回执带 planId");

// --- 4. 读回：列表 / 详情归一化（② 与 ① 同形） ------------------------------
recorded = [];
responder = () =>
  Response.json([
    {
      plan_id: "plan-push-1",
      action: "push-agent-package",
      spec,
      deadline_at: null,
      timeout_seconds: 0,
      phases: [
        {
          phase_index: 1,
          target_ids: ["gw-1"],
          advance_rule: "manual",
          status: "rolling",
        },
      ],
      batch_size: 0,
      current_phase: 1,
      status: "rolling",
      created_by: "admin",
      created_at: "2026-10-09T00:00:00+00:00",
      approved_by: "admin",
      approved_at: "2026-10-09T00:01:00+00:00",
    },
  ]);
const plans = await fetchUpgradePlans();
assert(recorded[0].url === "/api/v1/admin/rollout-plans", "list 路径");
assert(recorded[0].method === "GET", "list 必须 GET");
assert(
  plans.data.length === 1 && plans.data[0].action === "push-agent-package",
  "列表带 action",
);
assert(plans.data[0].phases[0].targetIds.join(",") === "gw-1", "阶段目标归一化");
assert(plans.data[0].currentPhase === 1, "current_phase 归一化");
assert(plans.data[0].deadlineAt === null, "缺省 deadline_at → null");

recorded = [];
responder = () =>
  Response.json({
    plan: {
      plan_id: "plan-push-1",
      action: "push-agent-package",
      spec,
      deadline_at: null,
      timeout_seconds: 0,
      phases: [
        {
          phase_index: 1,
          target_ids: ["gw-1"],
          advance_rule: "manual",
          status: "rolling",
        },
      ],
      batch_size: 0,
      current_phase: 1,
      status: "rolling",
      created_by: "admin",
      created_at: "2026-10-09T00:00:00+00:00",
      approved_by: "admin",
      approved_at: "2026-10-09T00:01:00+00:00",
    },
    entries: [
      {
        target_id: "gw-1",
        work_id: null,
        status: "dispatched",
        detail: "",
        updated_at: "2026-10-09T00:02:00+00:00",
      },
    ],
  });
const detail = await fetchUpgradePlan("plan-push-1");
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/plan-push-1",
  "detail 路径",
);
assert(recorded[0].method === "GET", "detail 必须 GET");
assert(detail.data.plan.action === "push-agent-package", "详情 plan.action");
assert(
  detail.data.entries.length === 1 &&
    detail.data.entries[0].status === "dispatched",
  "详情条目（逐网关进度）",
);

// --- 5. 批准 / 推进的线上契约（② 复用「发布执行」页，与 ① 一视同仁） -------------
// 计划回执的服务端形状（归一化要求 `plan_id`/`action`/`spec`/`timeout_seconds`/`batch_size`/
// `current_phase`/`status`/`created_by`/`created_at` 齐备）。
function planPayload(status: string, currentPhase: number) {
  return {
    plan_id: "plan-push-1",
    action: "push-agent-package",
    spec,
    deadline_at: null,
    timeout_seconds: 0,
    phases: [
      {
        phase_index: 1,
        target_ids: ["gw-1"],
        advance_rule: "manual",
        status: "rolling",
      },
    ],
    batch_size: 0,
    current_phase: currentPhase,
    status,
    created_by: "admin",
    created_at: "2026-10-09T00:00:00+00:00",
    approved_by: "admin",
    approved_at: "2026-10-09T00:01:00+00:00",
  };
}

recorded = [];
responder = () => Response.json(planPayload("rolling", 1));
const approved = await approveUpgradePlan({ planId: "plan-push-1" });
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/approve",
  "approve 路径",
);
assert(recorded[0].method === "POST", "approve 必须 POST");
assert(
  recorded[0].authorization === "Bearer admin-token-under-test",
  "approve 带 admin bearer",
);
assert(
  JSON.parse(recorded[0].body).plan_id === "plan-push-1",
  "approve body.plan_id",
);
assert(
  approved.source === "real" && approved.data.currentPhase === 1,
  "approve 回执归一化",
);

recorded = [];
responder = () => Response.json(planPayload("rolling", 2));
const advanced = await advanceUpgradePlan({ planId: "plan-push-1" });
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/advance",
  "advance 路径",
);
assert(recorded[0].method === "POST", "advance 必须 POST");
assert(
  JSON.parse(recorded[0].body).plan_id === "plan-push-1",
  "advance body.plan_id",
);
assert(
  advanced.source === "real" && advanced.data.currentPhase === 2,
  "advance 回执归一化",
);

// --- 6. 写操作**不回落示例**：失败必须冒出来 --------------------------------------
// 背景：`create` / `approve` / `advance` 是**写操作**，曾走 `fetchOrFallback` —— 任何非 429
// 失败都会返回一份示例计划（`source: "example"`），页面据此显示一张**假回执**（把失败伪装成成功）。
// 现与 `publishRelease` / `rotateGatewayLinkToken` 同一取舍：真实失败抛 `ApiError`，由页面报错。
async function assertRejects(label: string, run: () => Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await run();
  } catch {
    threw = true;
  }
  assert(threw, `${label} 在非 2xx 时必须抛错（不得回落示例）`);
}

for (const status of [401, 422, 500]) {
  responder = () => new Response("boom", { status });
  recorded = [];
  await assertRejects("createUpgradePlan", () =>
    createUpgradePlan({
      action: AGENT_PACKAGE_PUSH_ACTION,
      spec,
      targetIds: ["gw-1"],
      phaseCount: 1,
      deadlineAt: "2026-10-10T00:00:00Z",
      timeoutSeconds: 600,
      batchSize: 0,
    }),
  );
  await assertRejects("approveUpgradePlan", () =>
    approveUpgradePlan({ planId: "plan-push-1" }),
  );
  await assertRejects("advanceUpgradePlan", () =>
    advanceUpgradePlan({ planId: "plan-push-1" }),
  );
}

console.log("agent-package-push contract: OK");
