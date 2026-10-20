import { fetchUpgradePlan, setAdminApiToken } from "../src/api/admin";

// 契约测试：**失败任务的日志摘要**（center 0.19.3 + center-web 0.10.5）。
//
// 现场问题：计划条目只显示一句 `detail`，失败原因在网关本机的 `tasks/<id>/` 里，
// 人要 SSH 上去捞。现在 gwlinkd 把有界摘要（`log_excerpt`）随失败回执上报，中心落库，
// web 直接展开看。这里锁住：
//   1. 归一化：`log_excerpt` / `logExcerpt` 两种写法都认；没有就是 `null`（老中心）；
//   2. 不丢内容：换行 / 缩进原样带出（日志是给人读的原文）；
//   3. 老中心不炸：完全没有这两个字段时归一化仍是合法条目。
//
// Usage: npm run test:rollout-log-excerpt

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

let responder: () => Response = () => Response.json({});

globalThis.fetch = async () =>
  responder();

setAdminApiToken("test-admin-token");

function planWithEntry(entry: Record<string, unknown>) {
  return {
    plan: {
      plan_id: "plan-1",
      action: "upgrade",
      spec: "{}",
      deadline_at: null,
      timeout_seconds: 600,
      phases: [],
      batch_size: 0,
      current_phase: 1,
      status: "rolling",
      created_by: "admin",
      created_at: "2026-10-20T00:00:00+00:00",
      approved_by: "admin",
      approved_at: "2026-10-20T00:01:00+00:00",
    },
    entries: [entry],
  };
}

const detail = "executor exit status: 1；日志: /var/lib/gwlinkd/tasks/upgrade-p-1";
const excerpt = "# events\n{\"phase\":\"done\",\"detail\":\"status=failed\"}\n# output\n< 422 (12 ms)\n{\"error\":\"invalid model\"}";

// --- 1. 新中心：snake_case 字段归一化 ---------------------------------------------
responder = () =>
  Response.json(
    planWithEntry({
      target_id: "gw-1",
      work_id: null,
      status: "failed",
      detail,
      task_id: "upgrade-plan-1-20261020-143000",
      log_dir: "/var/lib/gwlinkd/tasks/upgrade-p-1",
      log_excerpt: excerpt,
      updated_at: "2026-10-20T00:02:00+00:00",
    }),
  );

let plan = await fetchUpgradePlan("plan-1");
assert(plan.data.entries.length === 1, "条目数");
const entry = plan.data.entries[0];
assert(entry.status === "failed", "状态");
assert(entry.logDir === "/var/lib/gwlinkd/tasks/upgrade-p-1", "log_dir 归一化");
assert(
  entry.taskId === "upgrade-plan-1-20261020-143000",
  "task_id 归一化（失败日志必须能对上那一次执行）",
);
assert(entry.logExcerpt === excerpt, "log_excerpt 原样带出（不压缩换行/缩进）");
assert(
  entry.logExcerpt!.split("\n").length === excerpt.split("\n").length,
  "行数不变（前端按 pre 渲染）",
);

// --- 2. camelCase 也认（兼容 web 侧的别处写法）------------------------------------
responder = () =>
  Response.json(
    planWithEntry({
      targetId: "gw-2",
      workId: null,
      status: "failed",
      detail: "boom",
      taskId: "upgrade-plan-2-20261020-144500",
      logDir: "/tmp/tasks/x",
      logExcerpt: "line-1\nline-2",
      updatedAt: "2026-10-20T00:03:00+00:00",
    }),
  );
plan = await fetchUpgradePlan("plan-1");
assert(plan.data.entries[0].logExcerpt === "line-1\nline-2", "camelCase log_excerpt");
assert(
  plan.data.entries[0].taskId === "upgrade-plan-2-20261020-144500",
  "camelCase task_id",
);

// --- 3. 老中心：没有这两个字段时是 null，不是 undefined / 空串 ---------------------
responder = () =>
  Response.json(
    planWithEntry({
      target_id: "gw-3",
      work_id: null,
      status: "succeeded",
      detail: "ok",
      updated_at: "2026-10-20T00:04:00+00:00",
    }),
  );
plan = await fetchUpgradePlan("plan-1");
const bare = plan.data.entries[0];
assert(bare.taskId === null, "缺 task_id → null");
assert(bare.logDir === null, "缺 log_dir → null");
assert(bare.logExcerpt === null, "缺 log_excerpt → null");

console.log("rollout log excerpt contract: ok");
