// 契约测试：调查面板的纯展示逻辑。
//
// 重点不是文案本身，而是**不允许混淆**的三组事实：
//   1. 任务三段状态（已下发 / 调查中 / 已回执）；
//   2. 证据「没有」与「看不到」的四类原因；
//   3. 下发失败要说下一步，而不是把错误码原样抛给运维。
//
// Usage: npm run test:agent-investigation-presentation

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

const {
  topicLabel,
  stateLabel,
  evidenceLabel,
  describeErrorCode,
  describeLaunchError,
  prettyJson,
} = await import("../src/components/agentInvestigationPresentation");
const { ApiError } = await import("../src/api/admin");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1) 题面：闭集里的出中文，闭集外的原样（不冒充）。
assert(topicLabel("disk") === "磁盘", "disk → 磁盘");
assert(topicLabel("telemetry-health") === "采集自检", "telemetry-health → 采集自检");
assert(topicLabel("memory") === "memory", "未知题面原样返回");

// 2) 任务状态：只有三段，未知状态原样（不猜成“已完成”）。
assert(stateLabel("queued") === "已下发", "queued");
assert(stateLabel("claimed") === "调查中", "claimed");
assert(stateLabel("acked") === "已回执", "acked");
assert(stateLabel("weird") === "weird", "未知状态不得被猜成终态");

// 3) 证据：就绪时带判定 / 大小 / 保留期。
assert(
  evidenceLabel({
    available: true,
    verdict: "warn",
    sizeBytes: 2048,
    retentionDays: 6,
  }) === "报告已就绪 · warn · 2 KiB · 还剩 6 天",
  "就绪时四项都要露出来",
);
assert(
  evidenceLabel({ available: true }) === "报告已就绪",
  "字段缺省时不能拼出多余的“ · ”"
);

// 4) 四类「看不到」必须各有各的话，不能统一成“暂无数据”。
const reasons: Array<[string, string]> = [
  ["not_yet_available", "报告同步中（已自动重试）"],
  ["evidence_not_configured", "证据服务未接入：只能看到任务进度"],
  ["tenant_unbound", "该网关还没绑定客户，读不到证据"],
  ["evidence_unavailable", "证据服务不可达（不是没有报告）"],
];
for (const [reason, expected] of reasons) {
  assert(
    evidenceLabel({ available: false, reason }) === expected,
    `reason=${reason} 的文案不对`,
  );
}
assert(
  evidenceLabel({ available: false }) === "报告不可见",
  "没给 reason 时也不能说成“没有报告”",
);

// 5) 下发失败：每个闸门都有下一步；未知码保留状态码与原文。
const cases: Array<[string, string]> = [
  ["investigation_not_granted", "这台机器没开这个调查面：先去网关侧「调查」页授予它。"],
  ["investigation_not_supported", "这台机器的 agentd 还不认识这一题（多半是没升级）。"],
  ["investigation_in_flight", "上一次调查还没回执，稍后再试。"],
  ["investigation_quota_exceeded", "这一小时的调查次数用尽，等一下再试。"],
  ["agent_investigate_unsupported", "该网关的 gwlinkd 版本太旧，不支持下发调查（需 ≥ 0.22）。"],
  ["agent_not_found", "中心还没见过这台 Agent（等它上报一次状态）。"],
];
for (const [code, expected] of cases) {
  assert(describeErrorCode(code, 400) === expected, `${code} 的文案不对`);
}
assert(
  describeErrorCode("something_new", 422, "boom") === "下发失败（something_new）：boom",
  "未知码要保留状态码与原文，便于排障",
);
assert(
  describeLaunchError(new ApiError(409, "/x", { code: "investigation_in_flight" })) ===
    "上一次调查还没回执，稍后再试。",
  "ApiError 要走同一张表",
);
assert(
  describeLaunchError("network down").startsWith("下发失败："),
  "非 ApiError 也要有一句人话",
);

// 6) 正文格式化：JSON 美化；非 JSON 原样（正文不保证是 JSON）。
assert(prettyJson('{"a":1}') === '{\n  "a": 1\n}', "JSON 要缩进");
assert(prettyJson("not json") === "not json", "非 JSON 原样");
assert(prettyJson(undefined) === "", "空正文 → 空串");

console.log("agent-investigation presentation: ok");
