import { fetchUpgradePlans, setPlanArchived } from "../src/api/admin";

// 契约测试：发布执行页的「归档 / 取消归档」。
//
// 归档是**标记**，不是删除：中心只改 `archived_at`，计划与逐目标条目全留；默认列表
// 不再带已归档的记录，显式 `include_archived=true` 才带。这里锁住四件容易漂移的事：
//   1. 归档端点：`POST /api/v1/admin/rollout-plans/{plan_id}/archive`，body `{ archived }`；
//   2. 读回归一化：`archived_at` → `archivedAt`（缺省 / null 都落 null，老中心不炸）；
//   3. 列表开关：默认不带 query，`fetchUpgradePlans(true)` 才带 `include_archived=true`；
//   4. 写操作不回落示例：失败必须抛错，不得伪装成成功回执。
//
// Usage: npm run test:plan-archive

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
  plan_id: "plan-archive-1",
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
  status: "completed",
  created_by: "admin",
  created_at: "2026-10-27T00:00:00+00:00",
  approved_by: "admin",
  approved_at: "2026-10-27T00:01:00+00:00",
  archived_at: "2026-10-27T01:00:00+00:00",
};

// --- 1. 归档端点：路径 / 方法 / body ---------------------------------------
recorded = [];
responder = () => Response.json(plan);
const archived = await setPlanArchived("plan-archive-1", true);
assert(recorded.length === 1, `归档应只发一次请求，实际 ${recorded.length}`);
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/plan-archive-1/archive",
  `归档路径不对：${recorded[0].url}`,
);
assert(recorded[0].method === "POST", `归档必须是 POST：${recorded[0].method}`);
assert(
  recorded[0].body === JSON.stringify({ archived: true }),
  `归档 body 不对：${recorded[0].body}`,
);
assert(archived.source === "real", "归档是写操作，不能回落示例数据");
assert(
  archived.data.archivedAt === "2026-10-27T01:00:00+00:00",
  `archived_at 没有归一化成 archivedAt：${archived.data.archivedAt}`,
);

// --- 2. 取消归档：同一端点，body `{ archived: false }` ----------------------
recorded = [];
responder = () => Response.json({ ...plan, archived_at: null });
const restored = await setPlanArchived("plan-archive-1", false);
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans/plan-archive-1/archive",
  `取消归档路径不对：${recorded[0].url}`,
);
assert(
  recorded[0].body === JSON.stringify({ archived: false }),
  `取消归档 body 不对：${recorded[0].body}`,
);
assert(restored.data.archivedAt === null, "取消归档后 archivedAt 应为 null");

// --- 3. 列表开关：默认不带 query，显式 true 才带 ---------------------------
recorded = [];
await fetchUpgradePlans();
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans",
  `默认列表不应带 include_archived：${recorded[0].url}`,
);

recorded = [];
responder = () =>
  Response.json([plan, { ...plan, plan_id: "plan-plain", archived_at: null }]);
const all = await fetchUpgradePlans(true);
assert(
  recorded[0].url === "/api/v1/admin/rollout-plans?include_archived=true",
  `已归档列表路径不对：${recorded[0].url}`,
);
assert(all.data.length === 2, "include_archived=true 应带回已归档记录");
assert(
  all.data[0].archivedAt === "2026-10-27T01:00:00+00:00",
  "已归档记录要带 archivedAt",
);
assert(all.data[1].archivedAt === null, "未归档记录 archivedAt 为 null");

// 老中心不返回 archived_at：缺省必须是 null，而不是 undefined / 报错。
recorded = [];
responder = () => {
  const { archived_at: _omit, ...without } = plan;
  return Response.json([without]);
};
const legacy = await fetchUpgradePlans(true);
assert(
  legacy.data[0].archivedAt === null,
  `缺省 archived_at 应归一化成 null：${String(legacy.data[0].archivedAt)}`,
);

// --- 4. 写操作不回落示例：失败必须抛错 --------------------------------------
recorded = [];
responder = () =>
  Response.json({ error: { code: "plan_not_archivable" } }, { status: 409 });
let rejected = false;
try {
  await setPlanArchived("plan-rolling", true);
} catch {
  rejected = true;
}
assert(rejected, "归档失败必须抛错，不能伪装成成功回执");

console.log("plan archive contract: OK");
