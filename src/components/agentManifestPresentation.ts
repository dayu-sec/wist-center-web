// 数据清单在**卡片上**怎么折 —— 纯逻辑，单独一处便于契约测试。
//
// 卡片只回答「有没有事」：一个总数 + 问题计数；逐条的来源、说明、份数都是详情页的事。
// 所以这里只定义两件事，它们直接决定用户第一眼看到什么，值得钉住：
//   1. 采集授权按严重度排（失败 > 降级 > 未上报 > 未知 > 正常 > 已暂停）——
//      详情页也用它，保证问题面在最前面；
//   2. 问题计数的口径（暂停不算问题；「未上报」比「正常」更该被看见）。

import type { AgentCollectionEntry, AgentInvestigationEntry } from "../api";

export interface CollectionProblems {
  failed: number;
  degraded: number;
  /** 既不是 ok / paused，也没有结论（`null` = 本机还没报过 / `unknown`）。 */
  unreported: number;
}

export interface InvestigationProblems {
  failed: number;
  warned: number;
}

/**
 * 采集授权的严重度（排序用）。
 *
 * 「还没上报」排在「正常」之前：该采的没回音，比「采着了」更该被看见。
 * 「已暂停」排最后：那是人主动关的，不是问题。
 */
/** 原因优先用结构化列表；旧 agentd 回退到 `collectionDetail`。 */
export function collectionDetailText(
  entry: AgentCollectionEntry,
): string | null {
  const reasons = entry.collectionReasons;
  if (reasons && reasons.length > 0) {
    return reasons
      .map((reason) =>
        reason.subject ? `${reason.subject}: ${reason.detail}` : reason.detail,
      )
      .join("；");
  }
  return entry.collectionDetail;
}

export function collectionSeverity(entry: AgentCollectionEntry): number {
  // 新模型优先；旧 agentd（无 result）回退到单一状态。
  if (entry.collectionResult) {
    switch (entry.collectionResult) {
      case "failure":
        return 5;
      case "partial":
        return 4;
      case "pending":
        return 3;
      case "cancelled":
        return entry.collectionPrerequisites === "blocked" ? 2 : 0;
      case "success":
        return 1;
      default:
        return 3;
    }
  }
  switch (entry.collectionStatus) {
    case "failed":
      return 5;
    case "degraded":
      return 4;
    case "unknown":
      return 2;
    case "ok":
      return 1;
    case "paused":
      return 0;
    default:
      return 3; // 还没报过（null）
  }
}

/** 按严重度倒序；同严重度保持网关给的顺序（`sort` 是稳定排序）。 */
export function sortCollectionBySeverity(
  entries: AgentCollectionEntry[],
): AgentCollectionEntry[] {
  return [...entries].sort((a, b) => collectionSeverity(b) - collectionSeverity(a));
}

/** 问题计数：只数**非暂停**的授权，正常的不出现在这里。 */
export function collectionProblems(
  entries: AgentCollectionEntry[],
): CollectionProblems {
  const problems: CollectionProblems = { failed: 0, degraded: 0, unreported: 0 };
  for (const entry of entries) {
    if (entry.status === "paused") continue;
    if (entry.collectionResult) {
      if (entry.collectionResult === "failure") problems.failed += 1;
      else if (entry.collectionResult === "partial") problems.degraded += 1;
      else if (entry.collectionResult !== "success") problems.unreported += 1;
      continue;
    }
    if (entry.collectionStatus === "failed") problems.failed += 1;
    else if (entry.collectionStatus === "degraded") problems.degraded += 1;
    else if (entry.collectionStatus !== "ok") problems.unreported += 1;
  }
  return problems;
}

export function investigationProblems(
  entries: AgentInvestigationEntry[],
): InvestigationProblems {
  const problems: InvestigationProblems = { failed: 0, warned: 0 };
  for (const entry of entries) {
    const overall = entry.overall.toLowerCase();
    if (overall === "fail") problems.failed += 1;
    else if (overall === "warn") problems.warned += 1;
  }
  return problems;
}
