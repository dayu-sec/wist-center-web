// 契约测试：调查任务归一化（中心 `GET …/investigations` → camelCase 视图）。
//
// 三条纪律：
//   1. `state` 必须原样保留（queued / claimed / acked），页面据此换文案；
//   2. 证据不可用时**必须带 reason**——「没有报告」与「看不到」不能混；
//   3. 后端只带 snake_case，前端视图是 camelCase；两者都要能读。
//
// Usage: npm run test:agent-investigation

// 假 window —— 必须在 import 前就位（`createAdminAuth` 会在求值时读它）。
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  },
  dispatchEvent: () => true,
};
globalThis.fetch = async () => Response.json({});

const { normalizeDispatchResult, normalizeInvestigationTask } = await import("../src/api/admin");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1) 后端 snake_case：在扫的任务 + 证据还没同步。
const running = normalizeInvestigationTask({
  command_id: "cmd_live_1",
  topic: "disk",
  state: "claimed",
  requested_at: "2026-11-10T10:00:00Z",
  claimed_at: "2026-11-10T10:00:05Z",
  acked_at: null,
  outcome: null,
  detail: "已取走，扫描中（最长 120s）",
  evidence: { available: false, reason: "not_yet_available" },
});
assert(running.commandId === "cmd_live_1", "command_id 必须读成 commandId");
assert(running.state === "claimed", "state 要原样保留");
assert(running.claimedAt === "2026-11-10T10:00:05Z", "claimed_at 要读成 claimedAt");
assert(running.ackedAt === null, "没回执就是 null（不是空串）");
assert(running.evidence.available === false, "证据未就绪");
assert(
  running.evidence.reason === "not_yet_available",
  "不可用时必须带 reason：『没有报告』与『看不到』不能混",
);

// 2) 已回执 + 证据就绪：大小 / 保留期 / 判定都要带出来。
const done = normalizeInvestigationTask({
  command_id: "cmd_done",
  topic: "load",
  state: "acked",
  requested_at: "2026-11-09T10:00:00Z",
  claimed_at: "2026-11-09T10:00:03Z",
  acked_at: "2026-11-09T10:00:40Z",
  outcome: "succeeded",
  detail: "load: 无异常",
  evidence: {
    available: true,
    kind: "investigation_report",
    verdict: "warn",
    size_bytes: 2048,
    sensitivity: "paths",
    retention_days: 6,
  },
});
assert(done.outcome === "succeeded", "outcome 原样");
assert(done.evidence.available === true, "证据可用");
assert(done.evidence.sizeBytes === 2048, "size_bytes → sizeBytes");
assert(done.evidence.retentionDays === 6, "retention_days → retentionDays");
assert(done.evidence.verdict === "warn", "verdict 原样");

// 3) 已是 camelCase 的载荷也要能读（示例数据 / 未来直出）。
const camel = normalizeInvestigationTask({
  commandId: "cmd_camel",
  topic: "accounts",
  state: "queued",
  requestedAt: "2026-11-10T11:00:00Z",
  evidence: { available: false, reason: "evidence_not_configured" },
});
assert(camel.commandId === "cmd_camel", "camelCase 也要能读");
assert(camel.topic === "accounts", "topic 原样");
assert(
  camel.evidence.reason === "evidence_not_configured",
  "未配置证据服务要说清楚是哪一种“看不到”",
);

// 4) 下发回执：网关拒绝时**没有任务**，只有这里能说清原因。
const rejected = normalizeDispatchResult({
  command_id: "cmd_dispatch_1",
  state: "failed",
  requested_at: "2026-11-10T12:00:00Z",
  result_status: 403,
  result_error: "investigation_not_granted: topic \"disk\" is not granted",
});
assert(rejected !== null, "有回执就要归一成对象");
assert(rejected.commandId === "cmd_dispatch_1", "command_id → commandId");
assert(rejected.resultStatus === 403, "result_status → resultStatus");
assert(
  rejected.resultError?.includes("investigation_not_granted"),
  "拒绝原因要带出来",
);
assert(normalizeDispatchResult(null) === null, "没有回执就是 null");

console.log("agent-investigation contract: ok");
