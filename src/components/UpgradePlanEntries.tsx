import {
  countEntries,
  entryStatusLabel,
  entryStatusTone,
  type RolloutTone,
} from "@dayu-sec/wist-web-core/release";
import { useUpgradePlan } from "../hooks";
import { Badge, LoadingDots, formatDateTime, type BadgeTone } from "./ui";
import styles from "./UpgradePlanEntries.module.css";

/** 共享口径的语气（ok/warn/crit/unknown）→ 本 app 的徽标色。 */
function toneToBadge(tone: RolloutTone): BadgeTone {
  switch (tone) {
    case "ok":
      return "green";
    case "warn":
      return "amber";
    case "crit":
      return "red";
    default:
      return "gray";
  }
}

/**
 * 一份计划的**逐目标进度**（`RolloutPlanView`：plan + entries）。
 *
 * 计划的状态只说「这张单子走到哪」，真正的事实（哪台成了、哪台没成、**为什么**）在条目里 ——
 * 失败原因就是条目的 `detail`。所以这里把条目铺出来，别让人只看到「失败」却看不到原因。
 */
export function UpgradePlanEntries({
  planId,
  status,
}: {
  planId: string;
  status: string;
}) {
  // 草稿还没有阶段/条目，不拉详情。
  const { data, isLoading, error } = useUpgradePlan(
    status === "draft" ? null : planId,
  );
  if (status === "draft") return null;

  const entries = data?.data.entries ?? [];

  if (error) {
    return (
      <div className={styles.wrap}>
        <div className={styles.notice}>读取逐目标进度失败：{String(error)}</div>
      </div>
    );
  }
  if (isLoading && entries.length === 0) {
    return (
      <div className={styles.wrap}>
        <LoadingDots />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.notice}>暂无逐目标进度。</div>
      </div>
    );
  }

  const counts = countEntries(entries);

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        共 {counts.total} 台 · 待派 {counts.pending} · 执行中 {counts.dispatched} ·
        成功 {counts.succeeded} · 失败 {counts.failed}
      </div>
      <ul className={styles.entries}>
        {entries.map((entry) => (
          <li key={entry.targetId} className={styles.entry}>
            <span className={styles.target}>{entry.targetId}</span>
            <Badge tone={toneToBadge(entryStatusTone(entry.status))}>
              {entryStatusLabel(entry.status)}
            </Badge>
            {entry.detail ? (
              <span
                className={`${styles.detail} ${
                  entry.status === "failed" ? styles.detailCrit : ""
                }`}
                title={entry.detail}
              >
                {entry.detail}
              </span>
            ) : (
              <span className={styles.detailEmpty} />
            )}
            <span className={styles.time}>
              {entry.updatedAt ? formatDateTime(entry.updatedAt) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
