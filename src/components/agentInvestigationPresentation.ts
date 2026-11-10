// Agent 调查面板的**纯展示逻辑**（不放 JSX，便于契约测试）。
//
// 这几条文案是页面与“现实”的唯一接口：
//   - 任务状态是闭集（已下发 / 调查中 / 已回执 / 已过期 / 被取代），不猜测；
//   - 证据状态必须区分「没有报告」与「看不到报告」；
//   - 下发失败要给下一步动作，而不是把错误码原样扔给运维。

import {
  ApiError,
  INVESTIGATION_TOPICS,
  type AgentInvestigationEvidence,
} from "../api/admin";

export function topicLabel(topic: string): string {
  return INVESTIGATION_TOPICS.find((item) => item.id === topic)?.label ?? topic;
}

/**
 * 任务进度。
 *
 * `expired` / `superseded` 虽然也带 `acked_at`，但它们**没有执行过** ——
 * 读成「已回执」会把「命令丢了」当成「做完了」（与网关队列页同一口径）。
 */
export function stateLabel(state: string): string {
  switch (state) {
    case "queued":
      return "已下发";
    case "claimed":
      return "调查中";
    case "acked":
      return "已回执";
    case "expired":
      return "已过期（未执行）";
    case "superseded":
      return "被取代";
    default:
      return state;
  }
}

/**
 * 终态结论的说法（`outcome` 是闭集）。
 *
 * `succeeded` 不单独上徽标（`已回执` 已经足够），但失败类必须说清是哪一种：
 * 「没跑」与「跑了但没成」的处置完全不同。
 */
export function outcomeLabel(outcome: string | null): string | null {
  switch (outcome) {
    case null:
      return null;
    case "succeeded":
      return "成功";
    case "failed":
      return "失败";
    case "no_uplink":
      return "无上送通道";
    case "throttled":
      return "被节流";
    case "stale":
      return "太晚取到（已失效）";
    case "unsupported":
      return "Agent 不支持";
    case "superseded":
      return "被新命令取代";
    case "expired":
      return "过期未执行";
    default:
      return outcome;
  }
}

/** 结论徽标的语气：只有“真出了问题”才用红色；等一等就会好的用琥珀色。 */
export function outcomeTone(outcome: string | null): "crit" | "warn" | null {
  switch (outcome) {
    case "failed":
    case "unsupported":
    case "no_uplink":
      return "crit";
    case "throttled":
    case "stale":
      return "warn";
    default:
      return null;
  }
}

/**
 * 证据一句话：**先分清「没有」与「看不到」**，再报内容。
 *
 * 这四种“看不到”的处置完全不同：
 *   - `not_yet_available` → 等（页面会自动重试）
 *   - `evidence_not_configured` → 去配中心 `[evidence]`
 *   - `tenant_unbound` → 先给网关绑客户
 *   - `evidence_unavailable` → 查证据服务（不是数据丢了）
 */
export function evidenceLabel(evidence: AgentInvestigationEvidence): string {
  if (evidence.available) {
    const parts = ["报告已就绪"];
    if (evidence.verdict) parts.push(evidence.verdict);
    if (evidence.sizeBytes) parts.push(formatSize(evidence.sizeBytes));
    if (evidence.retentionDays !== undefined) {
      parts.push(`还剩 ${evidence.retentionDays} 天`);
    }
    return parts.join(" · ");
  }
  switch (evidence.reason) {
    case "not_yet_available":
      return "报告同步中（已自动重试）";
    case "evidence_not_configured":
      return "证据服务未接入：只能看到任务进度";
    case "tenant_unbound":
      return "该网关还没绑定客户，读不到证据";
    case "evidence_unavailable":
      return "证据服务不可达（不是没有报告）";
    case "evidence_unauthorized":
      return "读取证据的令牌无效或已过期（换凭据，不是没有报告）";
    default:
      return "报告不可见";
  }
}

/** 闸门失败要说「下一步做什么」。 */
export function describeLaunchError(error: unknown): string {
  if (error instanceof ApiError) {
    return describeErrorCode(error.code, error.status, error.detail);
  }
  return `下发失败：${String(error)}`;
}

export function describeErrorCode(
  code: string | undefined,
  status: number,
  detail?: string,
): string {
  switch (code) {
    case "investigation_not_granted":
      return "这台机器没开这个调查面：先去网关侧「调查」页授予它。";
    case "investigation_not_supported":
      return "这台机器的 agentd 还不认识这一题（多半是没升级）。";
    case "investigation_in_flight":
      return "上一次调查还没回执，稍后再试。";
    case "investigation_quota_exceeded":
      return "这一小时的调查次数用尽，等一下再试。";
    case "agent_investigate_unsupported":
      return "该网关的 gwlinkd 版本太旧，不支持下发调查（需 ≥ 0.22）。";
    case "agent_not_found":
      return "中心还没见过这台 Agent（等它上报一次状态）。";
    default:
      return `下发失败（${code ?? status}）：${detail ?? ""}`;
  }
}

/** 报告正文格式化：解析不了就原样显示（证据正文是 JSON，但不保证）。 */
export function prettyJson(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** 与 `ui.tsx` 的 `formatBytes` 同口径，但这里不依赖组件文件（纯模块可单测）。 */
function formatSize(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
