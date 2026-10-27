import { deletePlan } from "../src/api/admin";

// 契约测试：发布执行页的「删除」。
//
// 与「归档」（只打标记）不同，删除是**物理删除**：中心删掉计划与逐目标条目，不可恢复。
// 这里锁住四件容易漂移的事：
//   1. 删除端点：`DELETE /api/v1/admin/rollout-plans/{plan_id}`（无 body）；
//   2. 回执是**被删前**的计划视图（`plan_id` / `status` / `archived_at` 仍按老口径归一化）；
//   3. 写操作不回落示例：失败必须抛错，不得伪装成成功回执；
//   4. 中心只受理终结态 → 409 要原样冒出来（页面据此提示「先推进到了结」）。
//
// Usage: npm run test:plan-delete

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

interface Recorded {
  url: string;
  method: string;
  body: string;
}

let recorded: Recorded[] = [];
let responder: () => Response = () => Response.json({});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  recorded.push({
    url: input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
    body: typeof init?.body === "string" ? init.body : "",
  });
  return responder();
};

const plan = {
  plan_id: "plan-delete-1",
  action: "upgrade",
  spec: '{"targets":[{"component":"wist-gateway-stack","target_version":"0.1.28"}]}',
  deadline_at: null,
  timeout_seconds: 0,
  phases: [
    {
      phase_index: 1,
      target_ids: ["gw-1"],
      advance_rule: "manual",
      status: "completed",
    },
  ],
  batch_size: 0,
  current_phase: 1,
  status: "failed",
  created_by: "admin",
  created_at: "2026-10-27T00:00:00+00:00",
  approved_by: "admin",
  approved_at: "2026-10-27T00:01:00+00:00",
  archived_at: null,
};

// --- 1. 删除端点：路径 / 方法 / 无 body ------------------------------------
recorded = [];
responder = () => Response.json(plan);
const deleted = await deletePlan("plan-delete-1");
assert(recorded.length === 1, `删除应只发一次请求，实际 ${recorded.length}`);
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/plan-delete-1",
  `删除路径不对：${recorded[0].url}`,
);
assert(
  recorded[0].method === "DELETE",
  `删除必须是 DELETE：${recorded[0].method}`,
);
assert(recorded[0].body === "", `删除不该带 body：${recorded[0].body}`);
assert(deleted.source === "real", "删除是写操作，不能回落示例数据");
assert(
  deleted.data.planId === "plan-delete-1",
  `回执 plan_id 没有归一化成 planId：${deleted.data.planId}`,
);
assert(
  deleted.data.status === "failed",
  `回执状态应是被删前那一份：${deleted.data.status}`,
);

// --- 2. 计划 id 需要编码（路径段安全） -------------------------------------
recorded = [];
responder = () => Response.json({ ...plan, plan_id: "a/b" });
await deletePlan("a/b");
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/a%2Fb",
  `plan_id 未编码：${recorded[0].url}`,
);

// --- 3. 写操作不回落示例：失败必须抛错 --------------------------------------
recorded = [];
responder = () =>
  Response.json({ error: { code: "plan_not_deletable" } }, { status: 409 });
let rejected = false;
let status = 0;
try {
  await deletePlan("plan-rolling");
} catch (error) {
  rejected = true;
  status = (error as { status?: number }).status ?? 0;
}
assert(rejected, "删除失败必须抛错，不能伪装成成功回执");
assert(status === 409, `执行中的计划应原样抛出 409：${status}`);

// --- 4. 404（已被并发删掉）也要冒出来 --------------------------------------
recorded = [];
responder = () =>
  Response.json({ error: { code: "rollout_plan_not_found" } }, { status: 404 });
rejected = false;
try {
  await deletePlan("plan-gone");
} catch {
  rejected = true;
}
assert(rejected, "计划不存在时必须抛错，不能当成删除成功");

console.log("plan delete contract: OK");
