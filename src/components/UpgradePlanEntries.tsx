import { type ReactNode } from "react";
import {
  countEntries,
  entryStatusLabel,
  entryStatusTone,
} from "@dayu-sec/wist-web-core/release";
import { useUpgradePlan } from "../hooks";
import { Badge, LoadingDots, formatDateTime, rolloutToneToBadge } from "./ui";
import { splitExecutionDetail } from "./executionDetail";
import { useCopyFeedback } from "./copyFeedback";
import styles from "./UpgradePlanEntries.module.css";

/**
 * 一段**点击即复制**的文本：整块是按钮，右侧给「复制 / 已复制」反馈。
 *
 * 执行反馈里常带网关本机路径，手选容易只选到一半；做成点击复制比让用户拖蓝更稳。
 * 剪贴板不可用（非安全上下文 / 权限拒绝）时静默不动，不打断页面。
 */
function CopyText({
  text,
  className,
  label,
  children,
}: {
  text: string;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const { state, copy } = useCopyFeedback();

  return (
    <button
      type="button"
      className={className}
      onClick={() => copy(text)}
      title={`${label}（点击复制）`}
    >
      {children}
      <span className={styles.copyHint} aria-live="polite">
        {state === "ok" ? "已复制" : state === "failed" ? "复制失败" : "复制"}
      </span>
    </button>
  );
}

/**
 * 一份计划的**逐目标进度**（`RolloutPlanView`：plan + entries）。
 *
 * 计划的状态只说「这张单子走到哪」，真正的事实（哪台成了、哪台没成、**为什么**）在条目里 ——
 * 失败原因就是条目的 `detail`。所以这里把条目铺出来，别让人只看到「失败」却看不到原因。
 *
 * 计划**已终结失败**（`failed`）时，逐台失败条目各给一个「重试」：它是**重派**（中心新建一份
 * 补跑计划），不是把这一条改回待派 —— 网关按 `plan_id` 去重，同一份计划改状态会被静默跳过。
 */
export function UpgradePlanEntries({
  planId,
  status,
  retryable = false,
  retryPending = false,
  onRetryTarget,
}: {
  planId: string;
  status: string;
  /** 计划已终结失败：失败条目可逐台重试。 */
  retryable?: boolean;
  retryPending?: boolean;
  onRetryTarget?: (targetId: string) => void;
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
        {entries.map((entry) => {
          const { message, logPath } = splitExecutionDetail(
            entry.detail,
            entry.logDir,
          );
          return (
            <li key={entry.targetId} className={styles.entry}>
              <div className={styles.row}>
                <span className={styles.target}>{entry.targetId}</span>
                <Badge tone={rolloutToneToBadge(entryStatusTone(entry.status))}>
                  {entryStatusLabel(entry.status)}
                </Badge>
                <span className={styles.spacer} />
                <span className={styles.time}>
                  {entry.updatedAt ? formatDateTime(entry.updatedAt) : "—"}
                </span>
                {retryable && entry.status === "failed" && onRetryTarget ? (
                  <button
                    type="button"
                    className={styles.retryButton}
                    disabled={retryPending}
                    onClick={() => onRetryTarget(entry.targetId)}
                    title="重派这台到一份新的补跑计划（同一 plan_id 改状态会被网关跳过）"
                  >
                    重试
                  </button>
                ) : null}
              </div>
              {message ? (
                <CopyText
                  text={entry.detail ?? message}
                  className={`${styles.detail} ${
                    entry.status === "failed" ? styles.detailCrit : ""
                  }`}
                  label="复制任务结果"
                >
                  <span className={styles.detailText}>{message}</span>
                </CopyText>
              ) : null}
              {logPath ? (
                <CopyText
                  text={logPath}
                  className={styles.logPath}
                  label="复制日志路径"
                >
                  <span className={styles.logLabel}>日志</span>
                  <code className={styles.logPathText} title={logPath}>
                    {logPath}
                  </code>
                </CopyText>
              ) : null}
              {entry.logExcerpt ? (
                // 失败回执带回来的日志摘要：直接展开看，不必去网关捞文件。
                // `pre` 保留行尾/缩进（日志是给人读的原文，不能重排）。
                <details className={styles.logDetails}>
                  <summary className={styles.logSummary}>
                    任务日志
                    {entry.taskId ? (
                      <span className={styles.taskId}>{entry.taskId}</span>
                    ) : null}
                  </summary>
                  <pre className={styles.logText}>{entry.logExcerpt}</pre>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
