import { useEffect, useState } from "react";
import { ApiError, type DiagnoseCheck, type GatewayControlTarget } from "../api";
import {
  useGatewayCommandStatus,
  useLatestGatewayDiagnose,
  useRestartGatewayRuntime,
  useRunGatewayDiagnose,
} from "../hooks";
import {
  commandStateLabel,
  commandStateTone,
  diagnoseStatusLabel,
  diagnoseStatusTone,
  isTerminalCommandState,
  sortDiagnoseChecks,
  summarizeDiagnose,
} from "./gatewayOps";
import {
  Badge,
  ErrorBanner,
  PrimaryButton,
  SectionCard,
  formatDateTime,
} from "./ui";
import { useCopyFeedback } from "./copyFeedback";
import styles from "./GatewayOpsPanel.module.css";

/**
 * 一条体检结果的可复制详情：点击整块（或 Enter / 空格）复制「状态 + code + 标题 + 详情 + 建议」。
 *
 * 失败项常带一长串漂移清单，手选容易漏行；做成点击复制，方便直接贴到群里 / issue。
 * 用 `role="button"` 而不是 `<button>`：块里是 `<pre>`（保留原文换行），button 不能包块级内容。
 */
function CheckDetail({ check }: { check: DiagnoseCheck }) {
  const { state, copy } = useCopyFeedback();
  const text = [
    `${diagnoseStatusLabel(check.status)} ${check.code} ${check.title}`,
    check.detail ?? "",
    check.hint ? `→ ${check.hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <pre
      className={`${styles.checkDetail} ${
        check.status === "fail" ? styles.checkDetailFailed : ""
      }`}
      role="button"
      tabIndex={0}
      title="点击复制这条体检结果"
      onClick={() => copy(text)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          copy(text);
        }
      }}
    >
      {check.detail}
      <span className={styles.copyHint} aria-live="polite">
        {state === "ok" ? "已复制" : state === "failed" ? "复制失败" : "复制"}
      </span>
    </pre>
  );
}

/**
 * 网关详情页的「运行时操作」：体检 / 重启网关 / 重启 gwlinkd。
 *
 * 三条动作都走中心命令队列（中心入队 → gwlinkd 短轮询取走执行），所以：
 * - **下发是异步的**：按钮只负责入队，结果在下方按 `state` 轮询显示；
 * - **重启会断掉执行者本身**：`gwlinkd` 的回执只代表“已触发”，恢复由随后的状态上报佐证；
 * - 体检报告就是 `gops run diagnose --json` 原文，逐条 `checks` 按“失败 → 警告 → 正常”排。
 */
export function GatewayOpsPanel({ gatewayId }: { gatewayId: string }) {
  const diagnose = useRunGatewayDiagnose();
  const restart = useRestartGatewayRuntime();
  const latest = useLatestGatewayDiagnose(gatewayId);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [commandKind, setCommandKind] = useState("");
  const command = useGatewayCommandStatus(gatewayId, commandId);

  // 换网关时清掉上一台的命令回执，避免串台。
  useEffect(() => {
    setCommandId(null);
    setCommandKind("");
  }, [gatewayId]);

  const report = latest.data?.report ?? null;
  const summary = summarizeDiagnose(report);
  const checks = sortDiagnoseChecks(report?.checks);
  const diagnosisState = latest.data?.state;

  const busy = diagnose.isPending || restart.isPending;
  const commandState = command.data?.state;

  function describeError(error: unknown, action: string): string {
    if (error instanceof ApiError) {
      const detail = error.detail ? `：${error.detail}` : "";
      if (error.status === 429) return `${action}过于频繁，请稍后再试${detail}`;
      if (error.status === 401) return `${action}需要有效的管理 token${detail}`;
      return `${action}失败（HTTP ${error.status}）${detail}`;
    }
    return `${action}失败：${String(error)}`;
  }

  function handleRestart(target: GatewayControlTarget) {
    const question =
      target === "gateway"
        ? "重启网关容器会短暂中断数据面（gops run stop → start），确定继续？"
        : "重启 gwlinkd 会断开与中心的控制链路数秒，确定继续？";
    if (!window.confirm(question)) return;
    restart.mutate(
      { gatewayId, target },
      {
        onSuccess: (result) => {
          setCommandId(result.command_id);
          setCommandKind(result.kind);
        },
      },
    );
  }

  return (
    <SectionCard
      title="运行时操作"
      subtitle="远程体检 / 重启网关与 gwlinkd：命令经中心队列下发，网关轮询取走执行。"
    >
      <div className={styles.actions}>
        <PrimaryButton
          disabled={busy}
          onClick={() => diagnose.mutate(gatewayId)}
        >
          {diagnose.isPending ? "下发中…" : "立即体检"}
        </PrimaryButton>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => handleRestart("gateway")}
        >
          重启网关
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => handleRestart("gwlinkd")}
        >
          重启 gwlinkd
        </button>
        <span className={styles.hint}>
          体检会扫描容器日志与挂载（约 1–5 秒）；重启是异步的，进度见下方。
        </span>
      </div>

      {diagnose.error ? (
        <ErrorBanner>{describeError(diagnose.error, "下发体检")}</ErrorBanner>
      ) : null}
      {restart.error ? (
        <ErrorBanner>{describeError(restart.error, "下发重启")}</ErrorBanner>
      ) : null}

      {commandId ? (
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>重启回执</span>
            <Badge tone={commandStateTone(commandState ?? "pending")}>
              {commandStateLabel(commandState ?? "pending")}
            </Badge>
          </div>
          <div className={styles.meta}>
            <span>
              命令 <code>{commandId}</code>
            </span>
            {commandKind ? <span>类型 {commandKind}</span> : null}
            {command.data?.response_status != null ? (
              <span>回执状态 {command.data.response_status}</span>
            ) : null}
            {command.data?.updated_at ? (
              <span>更新于 {formatDateTime(command.data.updated_at)}</span>
            ) : null}
          </div>
          {command.data?.error ? (
            <ErrorBanner>{command.data.error}</ErrorBanner>
          ) : null}
          {commandState === "done" ? (
            <p className={styles.muted}>
              命令已完成。若重启的是 gwlinkd，稍后看状态是否恢复上报即可。
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.block}>
        <div className={styles.blockHeader}>
          <span className={styles.blockTitle}>最近一次体检</span>
          {diagnosisState ? (
            <Badge tone={commandStateTone(diagnosisState)}>
              {commandStateLabel(diagnosisState)}
            </Badge>
          ) : null}
        </div>

        {latest.isLoading ? <p className={styles.muted}>读取中…</p> : null}
        {!latest.isLoading && !latest.data ? (
          <p className={styles.muted}>
            还没有体检记录。点「立即体检」让网关跑一次。
          </p>
        ) : null}
        {latest.data && !report ? (
          <p className={styles.muted}>
            {isTerminalCommandState(latest.data.state)
              ? "该次执行没有留下报告"
              : "执行中，稍候自动刷新…"}
            {latest.data.error ? `：${latest.data.error}` : ""}
          </p>
        ) : null}

        {report ? (
          <>
            <div className={styles.meta}>
              <span>正常 {summary.ok}</span>
              <span>警告 {summary.warn}</span>
              <span>失败 {summary.fail}</span>
              {latest.data?.updated_at ? (
                <span>报告时间 {formatDateTime(latest.data.updated_at)}</span>
              ) : null}
            </div>
            <ul className={styles.checks}>
              {checks.map((check) => (
                <li key={check.code} className={styles.check}>
                  <div className={styles.checkHeader}>
                    <Badge tone={diagnoseStatusTone(check.status)}>
                      {diagnoseStatusLabel(check.status)}
                    </Badge>
                    <code className={styles.checkCode}>{check.code}</code>
                    <span className={styles.checkTitle}>{check.title}</span>
                  </div>
                  {check.detail ? <CheckDetail check={check} /> : null}
                  {check.hint ? (
                    <p className={styles.checkHint}>→ {check.hint}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
