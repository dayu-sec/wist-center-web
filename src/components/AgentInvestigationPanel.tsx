import { useState } from "react";
import {
  INVESTIGATION_TOPICS,
  type AgentInvestigationTask,
} from "../api/admin";
import {
  useAgentInvestigationContent,
  useAgentInvestigations,
  useLaunchAgentInvestigation,
} from "../hooks";
import { formatRelativeTime } from "./ui";
import {
  describeLaunchError,
  evidenceLabel,
  outcomeLabel,
  outcomeTone,
  prettyJson,
  stateLabel,
  topicLabel,
} from "./agentInvestigationPresentation";
import styles from "./AgentInvestigationPanel.module.css";

/**
 * Agent 详情页的「调查」块：发起一次只读取证，并看它跑到哪、报告到没到。
 *
 * 三段分开说（设计 §7）：中心知道的是**任务状态**（网关随 60s 机队上报带上来），
 * 报告正文在证据库（按 `command_id` 取）。所以「在扫」「报告同步中」「证据服务不可达」
 * 是三种不同的现实，不能糊成一句「没有结果」。
 *
 * 为什么不做成弹窗式向导：调查是一次性、低频、需要留痕的动作；页面上就地选题目 + 二次确认
 * 已经足够，多一层向导只会让「上一次跑到哪」更难看到。
 */
export function AgentInvestigationPanel({
  gatewayId,
  agentId,
}: {
  gatewayId: string;
  agentId: string;
}) {
  const [topic, setTopic] = useState<string>("disk");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [openCommandId, setOpenCommandId] = useState<string | null>(null);

  const investigations = useAgentInvestigations(gatewayId, agentId);
  const launch = useLaunchAgentInvestigation();
  const tasks = investigations.data?.tasks ?? [];
  const selected = INVESTIGATION_TOPICS.find((item) => item.id === topic);

  const submit = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    launch.mutate(
      { gatewayId, agentId, topic, reason },
      { onSuccess: () => setReason("") },
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.topics} role="group" aria-label="调查题目">
          {INVESTIGATION_TOPICS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === topic ? styles.topicActive : styles.topic}
              aria-pressed={item.id === topic}
              onClick={() => {
                setTopic(item.id);
                setConfirming(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.launchBar}>
          <input
            className={styles.reason}
            placeholder="为什么查（可选，留痕）"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
          <button
            type="button"
            className={confirming ? styles.confirm : styles.launch}
            disabled={launch.isPending}
            onClick={submit}
          >
            {launch.isPending
              ? "下发中…"
              : confirming
                ? `确认发起${selected ? `「${selected.label}」` : ""}调查`
                : "发起调查"}
          </button>
          {confirming ? (
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          ) : null}
        </div>
      </div>
      <div className={styles.hint}>
        {selected?.hint}。调查在客户机上跑几十秒到两分钟，报告只进证据库；
        这里看到的是任务进度，正文按需读取。
      </div>

      {launch.error ? (
        <div className={styles.error}>
          {describeLaunchError(launch.error)}
        </div>
      ) : null}
      {launch.isSuccess ? (
        <div className={styles.notice}>
          已下发（<code>{launch.data.commandId}</code>），状态会随网关上自动更新。
        </div>
      ) : null}

      {/* 网关拒绝时不会有任务上报：只有中心命令回执能说清为什么没反应。 */}
      {investigations.data?.lastDispatch?.resultError ? (
        <div className={styles.error}>
          上次下发未成功：{investigations.data.lastDispatch.resultError}
        </div>
      ) : null}

      {investigations.isLoading ? (
        <div className={styles.empty}>读取调查任务…</div>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>
          {investigations.data?.lastDispatch
            ? waitingText(
                investigations.data.reportedAt,
                investigations.data.lastDispatch.requestedAt,
              )
            : "还没有调查过这台机器。"}
          <div className={styles.emptyHint}>
            最近 3 条、7 天内的任务会显示在这里；更早的请到证据库按 `command_id` 查。
          </div>
        </div>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <TaskRow
              key={task.commandId}
              task={task}
              open={openCommandId === task.commandId}
              onToggle={() =>
                setOpenCommandId((current) =>
                  current === task.commandId ? null : task.commandId,
                )
              }
              gatewayId={gatewayId}
              agentId={agentId}
            />
          ))}
        </ul>
      )}

      {investigations.error ? (
        <div className={styles.error}>
          读取任务状态失败：{String(investigations.error)}
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  open,
  onToggle,
  gatewayId,
  agentId,
}: {
  task: AgentInvestigationTask;
  open: boolean;
  onToggle: () => void;
  gatewayId: string;
  agentId: string;
}) {
  const label = topicLabel(task.topic);
  const evidence = task.evidence;
  // `succeeded` 不再加一个绿徽标：「已回执」已经是这个意思。
  const outcome = task.outcome === "succeeded" ? null : outcomeLabel(task.outcome);
  const tone = outcomeTone(task.outcome);
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.name}>{label}</span>
        <span className={`${styles.state} ${stateClass(task.state)}`}>
          {stateLabel(task.state)}
        </span>
        {outcome ? (
          <span
            className={`${styles.outcome} ${tone === "crit" ? styles.outcomeCrit : styles.outcomeWarn}`}
            title={task.detail ?? undefined}
          >
            {outcome}
          </span>
        ) : null}
      </div>
      <div className={styles.meta}>
        <span>{formatRelativeTime(task.requestedAt)}</span>
        <code>{task.commandId}</code>
        {task.detail ? <span>{task.detail}</span> : null}
      </div>
      <div className={styles.evidence}>
        <span className={evidence.available ? styles.evidenceOk : styles.evidenceMuted}>
          {evidenceLabel(evidence)}
        </span>
        {evidence.available ? (
          <button type="button" className={styles.reportLink} onClick={onToggle}>
            {open ? "收起报告" : "查看报告"}
          </button>
        ) : null}
      </div>
      {open ? (
        <ReportBody gatewayId={gatewayId} agentId={agentId} commandId={task.commandId} />
      ) : null}
    </li>
  );
}

function ReportBody({
  gatewayId,
  agentId,
  commandId,
}: {
  gatewayId: string;
  agentId: string;
  commandId: string;
}) {
  const content = useAgentInvestigationContent(gatewayId, agentId, commandId);
  if (content.isLoading) {
    return <div className={styles.empty}>读取报告…</div>;
  }
  if (content.error) {
    return <div className={styles.error}>{String(content.error)}</div>;
  }
  return <pre className={styles.report}>{prettyJson(content.data)}</pre>;
}

/**
 * 已下发但还没有任务行时的提示。
 *
 * 把「网关多久没收到这台机器的状态」端出来 —— 这正是最多的那种情况：命令排在网关，
 * 机器/agentd 没在跑，而中心只能看到「等」。`reportedAt` 是网关随状态上报带上来的
 * `last_seen_at`，它比任何猜测都准。
 */
function waitingText(reportedAt: string | null, requestedAt: string): string {
  const requested = Date.parse(requestedAt);
  const since = Number.isFinite(requested)
    ? Math.max(0, Math.round((Date.now() - requested) / 60_000))
    : null;
  const seen = reportedAt ? Date.parse(reportedAt) : NaN;
  const offlineMinutes = Number.isFinite(seen)
    ? Math.max(0, Math.round((Date.now() - seen) / 60_000))
    : null;
  if (offlineMinutes !== null && offlineMinutes >= 3) {
    return `已下发 ${since ?? "?"} 分钟，但网关已经 ${offlineMinutes} 分钟没收到这台机器的状态 —— 机器离线或 agentd 没在跑，命令还排在网关。`;
  }
  return `已下发 ${since ?? "?"} 分钟，等网关取走（状态随机队上报更新，≤60s）。`;
}

function stateClass(state: string): string {
  switch (state) {
    case "queued":
      return styles.stateQueued;
    case "claimed":
      return styles.stateClaimed;
    case "acked":
      return styles.stateAcked;
    // 过期 / 被取代都是「没跑」：不给绿色，也不能与「已回执」同色。
    case "expired":
    case "superseded":
      return styles.stateVoid;
    default:
      return styles.stateQueued;
  }
}
