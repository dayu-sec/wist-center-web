import {
  KNOWLEDGE_PACKAGE_PUSH_ACTION,
  approveUpgradePlan,
  createUpgradePlan,
  fetchUpgradePlan,
  fetchUpgradePlans,
  jsonKnowledgePushSpec,
  setAdminApiToken,
} from "../src/api/admin";

// 契约测试：知识库包下发（中心侧）的**线上契约**。
//
// 与 agent 包下发同一条通道：复用通用灰度发布计划（`Control.Rollout`），只差
// `action = push-knowledge-package` 与 spec 里的 `activate`。面板（`KnowledgePackagePushPanel`）
// 经 `createUpgradePlan` 提交；批准 / 推进 / 逐台进度复用「发布执行」页。这里锁住：
//   1. 动作字面量：与 Rust `wist_control::ACTION_PUSH_KNOWLEDGE_PACKAGE` 同值；
//   2. `spec` 拼装：`{"targets":[{"component":"wist-knowledge","target_version":"0.3.0"}],"activate":true}`，
//      `activate = false` 时不写该键（网关按缺省 false 处理）；
//   3. 创建 body 的字段名与动作值；
//   4. 读回：列表 / 详情带 `action`（与 ① 同形）；
//   5. 写操作**不回落示例**：失败必须抛错。
//
// Usage: npm run test:knowledge-package-push

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
  KNOWLEDGE_PACKAGE_PUSH_ACTION === "push-knowledge-package",
  "action 必须是 push-knowledge-package（与 wist_control::ACTION_PUSH_KNOWLEDGE_PACKAGE 同值）",
);

// --- 2. spec 拼装 -----------------------------------------------------------
const target = [{ component: "wist-knowledge", targetVersion: "0.3.0" }];
const activating = jsonKnowledgePushSpec(target, true);
assert(
  activating ===
    '{"targets":[{"component":"wist-knowledge","target_version":"0.3.0"}],"activate":true}',
  `spec 形状不对（activate=true）：${activating}`,
);
const recording = jsonKnowledgePushSpec(target, false);
assert(
  recording === '{"targets":[{"component":"wist-knowledge","target_version":"0.3.0"}]}',
  `activate=false 不该写出该键：${recording}`,
);

// --- 3. 创建：路径 / 方法 / bearer / body 字段名 -----------------------------
recorded = [];
responder = () =>
  Response.json({
    plan_id: "plan-knowledge-1",
    action: "push-knowledge-package",
    spec: activating,
    deadline_at: "2026-10-19T00:00:00Z",
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
    created_at: "2026-10-18T00:00:00+00:00",
    approved_by: null,
    approved_at: null,
  });

const created = await createUpgradePlan({
  action: KNOWLEDGE_PACKAGE_PUSH_ACTION,
  spec: activating,
  targetIds: ["gw-1", "gw-2"],
  phaseCount: 1,
  deadlineAt: "2026-10-19T00:00:00Z",
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
assert(body.action === "push-knowledge-package", "body.action");
const sentSpec = JSON.parse(body.spec);
assert(sentSpec.targets[0].component === "wist-knowledge", "body.spec.targets[0].component");
assert(
  sentSpec.targets[0].target_version === "0.3.0",
  "body.spec.targets[0].target_version",
);
assert(sentSpec.activate === true, "body.spec.activate");
assert(
  Array.isArray(body.target_ids) && body.target_ids.join(",") === "gw-1,gw-2",
  "body.target_ids（阶段由服务端切）",
);
assert(body.phase_count === 1, "body.phase_count");
assert(body.deadline_at === "2026-10-19T00:00:00Z", "body.deadline_at");
assert(body.timeout_seconds === 600, "body.timeout_seconds");
assert(body.batch_size === 0, "body.batch_size");
assert(body.phases === undefined, "客户端不自己切阶段，body 里不该有 phases");
assert(created.source === "real", "create 应取真实回执");
assert(created.data.action === "push-knowledge-package", "回执带 action");
assert(created.data.planId === "plan-knowledge-1", "回执带 planId");

// --- 4. 读回：列表 / 详情归一化 ----------------------------------------------
recorded = [];
responder = () =>
  Response.json([
    {
      plan_id: "plan-knowledge-1",
      action: "push-knowledge-package",
      spec: activating,
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
      created_at: "2026-10-18T00:00:00+00:00",
      approved_by: "admin",
      approved_at: "2026-10-18T00:01:00+00:00",
    },
  ]);
const plans = await fetchUpgradePlans();
assert(recorded[0].url === "/api/v1/admin/rollout-plans", "list 路径");
assert(
  plans.data.length === 1 && plans.data[0].action === "push-knowledge-package",
  "列表带 action",
);

recorded = [];
responder = () =>
  Response.json({
    plan: {
      plan_id: "plan-knowledge-1",
      action: "push-knowledge-package",
      spec: activating,
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
      created_at: "2026-10-18T00:00:00+00:00",
      approved_by: "admin",
      approved_at: "2026-10-18T00:01:00+00:00",
    },
    entries: [
      {
        target_id: "gw-1",
        work_id: null,
        status: "succeeded",
        detail: "done",
        updated_at: "2026-10-18T00:02:00+00:00",
      },
    ],
  });
const detail = await fetchUpgradePlan("plan-knowledge-1");
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/plan-knowledge-1",
  "detail 路径",
);
assert(detail.data.plan.action === "push-knowledge-package", "详情 plan.action");
assert(
  detail.data.entries.length === 1 && detail.data.entries[0].status === "succeeded",
  "详情条目（逐网关进度）",
);

// --- 5. 写操作**不回落示例**：失败必须冒出来 --------------------------------------
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
  await assertRejects("createUpgradePlan(knowledge)", () =>
    createUpgradePlan({
      action: KNOWLEDGE_PACKAGE_PUSH_ACTION,
      spec: activating,
      targetIds: ["gw-1"],
      phaseCount: 1,
      deadlineAt: "2026-10-19T00:00:00Z",
      timeoutSeconds: 600,
      batchSize: 0,
    }),
  );
  await assertRejects("approveUpgradePlan(knowledge)", () =>
    approveUpgradePlan({ planId: "plan-knowledge-1" }),
  );
}

console.log("knowledge-package-push contract: OK");
