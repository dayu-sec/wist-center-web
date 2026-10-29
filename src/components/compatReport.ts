import type { BadgeTone } from "./ui";
import type { CompatManifest, CompatReport, CompatStatus } from "../api/admin";

/**
 * 兼容性展示的**纯逻辑**（无 JSX / 无 CSS），给 `Compatibility.tsx` 和契约测试共用。
 *
 * 口径与后端 `wist_release::compat::check` 一致：只有 `requires` 被明确违反才是
 * `error`（红）；`supports` 越界 / 对端版本未知是 `warn`（黄）；包内没有声明是
 * `unknown`（灰）—— **“没声明”不是“兼容”**，所以它绝不能落成绿色。
 */

export function compatTone(status: CompatStatus): BadgeTone {
  switch (status) {
    case "ok":
      return "green";
    case "warn":
      return "amber";
    case "error":
      return "red";
    default:
      return "gray";
  }
}

export function compatLabel(status: CompatStatus): string {
  switch (status) {
    case "ok":
      return "兼容";
    case "warn":
      return "有告警";
    case "error":
      return "不兼容";
    default:
      return "未验证";
  }
}

/** 报告 → 一句话摘要（列表行上显示；详情里还有逐条原因）。 */
export function compatSummary(report: CompatReport | null): string {
  if (!report) return "未检查";
  const findings = report.checks.filter((check) => check.severity !== "ok");
  switch (report.status) {
    case "ok":
      return "范围都满足";
    case "warn":
      return findings.length > 0 ? `${findings.length} 项告警` : "有告警";
    case "error":
      return findings.length > 0 ? `${findings.length} 项不兼容` : "不兼容";
    default:
      return "包内未声明兼容范围";
  }
}

/** 详情面板的「声明范围」分组（顺序固定：上游 → 下游 → 共存）。 */
export function compatRangeRows(
  manifest: CompatManifest,
): { label: string; ranges: Record<string, string> }[] {
  return [
    { label: "requires（上游必须满足）", ranges: manifest.requires },
    { label: "supports（可服务的下游）", ranges: manifest.supports },
    { label: "coexists_with（混合版本可共存）", ranges: manifest.coexistsWith },
  ];
}

/** 严重级别 → 中文（列表/详情共用）。 */
export function compatSeverityLabel(severity: string): string {
  switch (severity) {
    case "ok":
      return "通过";
    case "warn":
      return "告警";
    case "error":
      return "阻断";
    default:
      return severity;
  }
}
