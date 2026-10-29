import type { CompatManifest, CompatReport } from "../api/admin";
import { Badge, formatDateTime } from "./ui";
import {
  compatLabel,
  compatRangeRows,
  compatSeverityLabel,
  compatTone,
} from "./compatReport";
import styles from "./Compatibility.module.css";

/**
 * 兼容性展示（包列表 / 包详情共用）。
 *
 * 两件事必须同时在场，缺一个操作者就没法判断：
 * ① **声明的范围**（包内 `compat.json`：requires / supports / coexists_with）；
 * ② **按当前节点的检查结果**（`ok / warn / error / unknown` + 逐条原因）。
 *
 * 颜色 / 文案 / 摘要的口径在 [`compatReport`](./compatReport.ts)：`unknown` 是**灰**，
 * 不显示成绿色——那是“没检查”，不是“检查通过”。
 */



/** 列表行上的徽标（没有报告时显示灰色「未检查」）。 */
export function CompatibilityBadge({ report }: { report: CompatReport | null }) {
  if (!report) {
    return <Badge tone="gray">未检查</Badge>;
  }
  return <Badge tone={compatTone(report.status)}>{compatLabel(report.status)}</Badge>;
}

function RangeRow({
  label,
  ranges,
}: {
  label: string;
  ranges: Record<string, string>;
}) {
  const entries = Object.entries(ranges);
  return (
    <div className={styles.rangeRow}>
      <span className={styles.rangeLabel}>{label}</span>
      <span className={styles.rangeValues}>
        {entries.length === 0 ? (
          <span className={styles.muted}>—</span>
        ) : (
          entries.map(([peer, range]) => (
            <span key={peer} className={styles.rangeChip}>
              <span className={styles.rangePeer}>{peer}</span>
              <span className={styles.rangeValue}>{range}</span>
            </span>
          ))
        )}
      </span>
    </div>
  );
}

/**
 * 兼容性详情面板：声明的范围 + 逐条检查结果。
 *
 * `report.current` 是检查时掌握的 peer 版本 —— 一起展示，否则“为什么是黄”看不出来。
 */
export function CompatibilityDetail({
  manifest,
  report,
}: {
  manifest: CompatManifest | null;
  report: CompatReport | null;
}) {
  const current = Object.entries(report?.current ?? {});
  return (
    <div className={styles.panel}>
      <div className={styles.column}>
        <div className={styles.columnHead}>声明的兼容范围（包内 compat.json）</div>
        {manifest ? (
          <>
            {compatRangeRows(manifest).map((row) => (
              <RangeRow
                key={row.label}
                label={row.label}
                ranges={row.ranges}
              />
            ))}
            <div className={styles.flags}>
              <span
                className={
                  manifest.compatMode
                    ? `${styles.flag} ${styles.flagOn}`
                    : styles.flag
                }
              >
                compat_mode {manifest.compatMode ? "开" : "关"}
              </span>
              <span
                className={
                  manifest.reversible
                    ? `${styles.flag} ${styles.flagOn}`
                    : styles.flag
                }
              >
                可单步回退 {manifest.reversible ? "是" : "否"}
              </span>
              {manifest.bridge.length > 0 ? (
                <span className={styles.flag}>
                  中间版本 {manifest.bridge.join(" → ")}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className={styles.muted}>
            这个包没有 `compat.json`：兼容性未声明，按「未验证」处理（不会当成兼容）。
          </p>
        )}
      </div>

      <div className={styles.column}>
        <div className={styles.columnHead}>
          检查结果（按当前中心版本）
          {report ? (
            <span className={styles.checkedAt}>
              {formatDateTime(report.checkedAt)}
            </span>
          ) : null}
        </div>
        {current.length > 0 ? (
          <div className={styles.currentRow}>
            <span className={styles.rangeLabel}>当前版本</span>
            <span className={styles.rangeValues}>
              {current.map(([peer, version]) => (
                <span key={peer} className={styles.rangeChip}>
                  <span className={styles.rangePeer}>{peer}</span>
                  <span className={styles.rangeValue}>{version}</span>
                </span>
              ))}
            </span>
          </div>
        ) : null}
        {report == null ? (
          <p className={styles.muted}>
            没有检查结果（后端未返回或尚未检查）。
          </p>
        ) : report.checks.length === 0 ? (
          <p className={styles.muted}>没有需要检查的对端。</p>
        ) : (
          <ul className={styles.checks}>
            {report.checks.map((check, index) => (
              <li
                key={`${check.peer}/${index}`}
                className={`${styles.check} ${styles[`severity_${check.severity}`] ?? ""}`}
              >
                <span className={styles.severityTag}>
                  {compatSeverityLabel(check.severity)}
                </span>
                <span className={styles.checkMessage}>{check.message}</span>
                <span className={styles.checkDetail}>
                  {check.peer} · 要求 {check.required} · 实际{" "}
                  {check.actual === "" ? "未知" : check.actual}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
