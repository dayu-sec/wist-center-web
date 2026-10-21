// 网关运行时操作（体检 / 重启）的**纯口径**：文案、颜色、进度判定。
//
// 单独抽成模块的原因与 `gatewayUpgradeTargets` 一样：页面渲染不好测，但
// 「什么状态算结束」「失败的徽章是什么色」这类判定一旦漂移，轮询会停不下来或者谎报成功。
// 这里全部是纯函数，契约测试直接跑（见 `tests/gateway-ops-contract.test.ts`）。

import type { DiagnoseReport } from "../api";
import type { BadgeTone } from "./ui";

/** 体检单条的展示文案。 */
export function diagnoseStatusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "正常";
    case "warn":
      return "警告";
    case "fail":
      return "失败";
    default:
      return status ? status : "未知";
  }
}

/** 体检单条的徽章色：绿 / 黄 / 红；未知一律灰（不把认不出的状态画成“正常”）。 */
export function diagnoseStatusTone(status: string): BadgeTone {
  switch (status) {
    case "ok":
      return "green";
    case "warn":
      return "amber";
    case "fail":
      return "red";
    default:
      return "gray";
  }
}

/** 控制命令队列状态的展示文案。 */
export function commandStateLabel(state: string): string {
  switch (state) {
    case "pending":
      return "排队中";
    case "leased":
      return "执行中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "expired":
      return "已过期（网关未取走）";
    default:
      return state ? state : "未知";
  }
}

export function commandStateTone(state: string): BadgeTone {
  switch (state) {
    case "pending":
    case "leased":
      return "blue";
    case "done":
      return "green";
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

const TERMINAL_STATES = new Set(["done", "failed", "expired"]);

/** 轮询到这里就该停：再问也不会有新结果。 */
export function isTerminalCommandState(state: string | null | undefined): boolean {
  return typeof state === "string" && TERMINAL_STATES.has(state);
}

/**
 * 体检汇总：优先用报告自带的 `summary`（gops 已经数好），缺失时从 `checks` 现数。
 *
 * 为什么要有兜底：老版本 gops 或手工粘贴的报告可能没有 `summary` —— 这时页面仍要能显示
 * 三类计数，而不是整块变成空白。
 */
export function summarizeDiagnose(report: DiagnoseReport | null | undefined): {
  ok: number;
  warn: number;
  fail: number;
} {
  if (!report) return { ok: 0, warn: 0, fail: 0 };
  const summary = report.summary;
  if (summary) {
    return { ok: summary.ok ?? 0, warn: summary.warn ?? 0, fail: summary.fail ?? 0 };
  }
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const check of report.checks ?? []) {
    if (check.status === "ok") counts.ok += 1;
    else if (check.status === "warn") counts.warn += 1;
    else if (check.status === "fail") counts.fail += 1;
  }
  return counts;
}

/** 体检列表排序：失败在前，其次警告，再按 code（与服务端一致，输出稳定）。 */
export function sortDiagnoseChecks<T extends { status: string; code: string }>(
  checks: T[] | null | undefined,
): T[] {
  const rank = (status: string) =>
    status === "fail" ? 0 : status === "warn" ? 1 : status === "ok" ? 2 : 3;
  return [...(checks ?? [])].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.code.localeCompare(b.code),
  );
}
