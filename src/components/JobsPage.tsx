import { useMemo, useState } from "react";
import {
  isAdminJobTerminal,
  type AdminJob,
  type AdminJobQuery,
} from "../api";
import { useCancelJob, useJobs } from "../hooks";
import { Badge, ErrorBanner, PageShell, formatDateTime } from "./ui";
import type { BadgeTone } from "./ui";
import styles from "./JobsPage.module.css";

const STATE_FILTERS = [
  { value: "", label: "全部状态" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "执行中" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

function stateLabel(state: string): string {
  switch (state) {
    case "queued":
      return "排队中";
    case "running":
      return "执行中";
    case "succeeded":
      return "成功";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
    default:
      // 中心以后加中间态（如 retrying）时原样显示，别硬塞进已知的五个词里。
      return state || "未知";
  }
}

function stateTone(state: string): BadgeTone {
  switch (state) {
    case "running":
      return "blue";
    case "succeeded":
      return "green";
    case "failed":
      return "red";
    case "queued":
      return "amber";
    default:
      return "gray";
  }
}

/** 进度文案：有分母就 `2/3`，否则退回任务自己写的说明。 */
function progressText(job: AdminJob): string {
  if (job.progress.total > 0) {
    return `${job.progress.completed}/${job.progress.total}`;
  }
  return job.progress.message || "—";
}

function JobRow({ job }: { job: AdminJob }) {
  const cancel = useCancelJob();
  const canCancel = job.state === "queued";
  const pending = cancel.isPending && cancel.variables === job.jobId;

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>
          <Badge tone={stateTone(job.state)}>{stateLabel(job.state)}</Badge>
          <span className={styles.jobId}>{job.jobId}</span>
        </span>
        <span className={styles.rowSub}>
          {job.queue}
          <span className={styles.dot}>·</span>
          {job.kind}
          {job.subject ? (
            <>
              <span className={styles.dot}>·</span>
              主体 {job.subject}
            </>
          ) : null}
        </span>
        {job.progress.message ? (
          <span className={styles.rowNote}>{job.progress.message}</span>
        ) : null}
        {job.errorDetail ? (
          <span className={styles.rowError}>
            {job.errorCode ? `[${job.errorCode}] ` : ""}
            {job.errorDetail}
          </span>
        ) : null}
      </div>

      <div className={styles.rowSide}>
        <span className={styles.progress}>{progressText(job)}</span>
        <span className={styles.time}>
          提交 {formatDateTime(job.createdAt)}
        </span>
        {job.finishedAt ? (
          <span className={styles.time}>
            结束 {formatDateTime(job.finishedAt)}
          </span>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className={styles.cancel}
            disabled={pending}
            onClick={() => cancel.mutate(job.jobId)}
          >
            {pending ? "取消中…" : "取消"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 任务队列：中心所有**异步后台任务**的统一读面（目前是远程包下载，后续新增的 handler
 * 不需要各自再做一页）。
 *
 * 与「安装包录入」页里的下载任务列表的区别：那里按组件过滤、只解释 release 的字段
 * （取包 2/3、产物版本）；这里看的是任务本体 —— 队列、kind、主体、原始错误，用来回答
 * 「中心现在在忙什么 / 刚才那条为什么失败」。排队中的任务可以就地取消。
 */
export function JobsPage() {
  const [state, setState] = useState("");
  const [queue, setQueue] = useState("");
  const query = useMemo<AdminJobQuery>(
    () => ({ state: state || undefined, queue: queue.trim() || undefined }),
    [state, queue],
  );
  const { data, error, isError } = useJobs(query);
  const jobs = data ?? [];

  const active = jobs.filter((job) => !isAdminJobTerminal(job.state)).length;
  const failed = jobs.filter((job) => job.state === "failed").length;

  return (
    <PageShell
      title="任务队列"
      summary="中心执行的所有异步任务（远程包下载等），同一队列串行执行；排队中的任务可以取消，终结后的任务按保留期自动清理。"
    >
      <section className={styles.content}>
        <div className={styles.toolbar}>
          <label className={styles.filter}>
            <span>状态</span>
            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              {STATE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filter}>
            <span>队列</span>
            <input
              value={queue}
              onChange={(event) => setQueue(event.target.value)}
              placeholder="全部（如 release-download）"
            />
          </label>
          <span className={styles.summary}>
            共 {jobs.length} 条
            {active > 0 ? ` · 在飞 ${active} 条` : ""}
            {failed > 0 ? ` · 失败 ${failed} 条` : ""}
          </span>
        </div>

        {isError ? (
          <ErrorBanner>
            任务列表加载失败：{String(error)}（会自动重试）
          </ErrorBanner>
        ) : null}

        {jobs.length === 0 ? (
          <div className={styles.empty}>
            {isError
              ? "暂时取不到任务列表。"
              : "没有符合条件的任务。发布 / 录入安装包后，任务会出现在这里。"}
          </div>
        ) : (
          <div className={styles.list}>
            {jobs.map((job) => (
              <JobRow key={job.jobId} job={job} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
