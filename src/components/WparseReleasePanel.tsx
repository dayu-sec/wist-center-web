import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api";
import {
  useGatewayCommandStatus,
  useGatewayStatusView,
  usePublishWparseRelease,
  useWparseRepos,
  useWparseTags,
} from "../hooks";
import { commandStateLabel, commandStateTone } from "./gatewayOps";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import planStyles from "./PlanForm.module.css";
import { Badge, ErrorBanner, PrimaryButton, SectionCard, formatDateTime } from "./ui";
import styles from "./WparseReleasePanel.module.css";
import {
  defaultWparseTag,
  shortWparseCommit,
  validWparseTag,
} from "./wparseRelease";

/**
 * 规则 / 配置发布入口（`wparse-rules` / `wparse-infra`）。
 *
 * 一个组件服务两个入口：repo 名从 props 来，repo 地址 / provider / token 全部由中心配置决定。
 * 发布动作复用 wparse-proxy 的命令队列；gwlinkd 的 relay 原样执行，不需要网关改动。
 */
export function WparseReleasePanel({
  repoName,
  title,
  subtitle,
}: {
  repoName: string;
  title: string;
  subtitle: string;
}) {
  const repos = useWparseRepos();
  const repo = repos.data?.repos.find((item) => item.name === repoName);
  const tags = useWparseTags(repoName, Boolean(repo));
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  // 写操作不能用示例机队：示例里的 gateway_id 在中心不存在。
  const exampleFleet = statusData?.source === "example";
  const publish = usePublishWparseRelease(repoName);

  const [tag, setTag] = useState("");
  const [manual, setManual] = useState(false);
  const [manualTag, setManualTag] = useState("");
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const initializedTargets = useRef(false);

  const tagOptions = tags.data?.tags ?? [];
  const allowManual = repos.data?.allowManualTag === true || repo?.provider === "manual";
  const manualOnly = repo?.provider === "manual";

  // provider=manual 没有候选列表：直接进入手填。
  useEffect(() => {
    if (manualOnly) setManual(true);
  }, [manualOnly]);

  // 默认选最新 tag；用户已经选过就不覆盖。
  useEffect(() => {
    if (!tag && tagOptions.length > 0) {
      setTag(defaultWparseTag(tagOptions));
    }
  }, [tag, tagOptions]);

  // 目标默认勾选在线网关；用户手动改过之后不再自动覆盖。
  // 示例机队不参与初始化：示例里的 gateway_id 在中心不存在；等真实数据到达后再勾。
  useEffect(() => {
    if (exampleFleet) {
      initializedTargets.current = false;
      return;
    }
    if (initializedTargets.current || gateways.length === 0) return;
    initializedTargets.current = true;
    setSelectedIds(
      new Set(
        gateways
          .filter((gateway) => gateway.status !== "offline")
          .map((gateway) => gateway.gatewayId),
      ),
    );
  }, [exampleFleet, gateways]);

  const maxTargets = repos.data?.maxTargets ?? 20;
  const tooManyTargets = selectedIds.size > maxTargets;
  const effectiveTag = (manual ? manualTag : tag).trim();
  const canSubmit =
    repos.data?.available === true &&
    !exampleFleet &&
    validWparseTag(effectiveTag) &&
    selectedIds.size > 0 &&
    !tooManyTargets &&
    !publish.isPending;

  function toggleGateway(gatewayId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(gatewayId)) {
        next.delete(gatewayId);
      } else {
        next.add(gatewayId);
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    publish.mutate({
      tag: effectiveTag,
      gatewayIds: [...selectedIds].sort(),
      reason,
      // provider=manual / 用户手填时不强求服务端校验；服务端仍按 allow_manual_tag 裁决。
      verifyTag: !manual,
    });
  }

  const selectedMeta = tagOptions.find((item) => item.tag === tag);
  const result = publish.data;

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {repos.isLoading ? (
        <div className={planStyles.empty}>正在读取发布入口配置…</div>
      ) : repos.isError && !repos.data ? (
        <ErrorBanner>读取发布入口失败：{describeError(repos.error)}</ErrorBanner>
      ) : !repo ? (
        <div className={planStyles.empty}>
          中心配置里没有 `{repoName}`；在 `[wparse_release.repos]` 里补一条后重启中心。
        </div>
      ) : (
        <>
          <div className={styles.meta}>
            <span>
              <strong>group</strong> {repo.group}
            </span>
            <span>
              <strong>provider</strong> {repo.provider}
            </span>
            <span className={styles.repoUrl}>{repo.repo}</span>
            {repo.tokenConfigured ? null : (
              <Badge tone="amber">未配置读 token</Badge>
            )}
          </div>

          {repos.data?.available ? null : (
            <div className={planStyles.exampleBanner} role="alert">
              发布入口当前不可用：需要 `[wparse_release].enabled = true`、
              `[wparse_proxy].enabled = true`，且中心使用 PostgreSQL
              （命令队列需要事务）。
            </div>
          )}
          {exampleFleet ? (
            <div className={planStyles.exampleBanner} role="alert">
              当前网关列表是内置示例数据（管理接口未就绪或未鉴权）。示例里的 gateway_id
              在中心不存在，已禁用发布。
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className={planStyles.block}>
              <div className={planStyles.blockHeader}>
                <span className={planStyles.blockTitle}>版本 tag</span>
                <span className={planStyles.sectionNote}>
                  从仓库 tag 列表里选；发布前服务端会再校验一次并记录 commit
                </span>
              </div>

              {tags.isLoading && !manualOnly ? (
                <span className={planStyles.formNote}>正在读取 tag 列表…</span>
              ) : null}
              {tags.isError && !tags.data && !manualOnly ? (
                <ErrorBanner>读取 tag 列表失败：{describeError(tags.error)}</ErrorBanner>
              ) : null}
              {tags.data?.stale ? (
                <span className={planStyles.formNote}>
                  外部 API 暂时不可用，当前显示的是缓存列表（可能不是最新）。
                </span>
              ) : null}

              {manualOnly ? null : (
                <div className={styles.tagRow}>
                  <select
                    className={planStyles.input}
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                    disabled={tagOptions.length === 0}
                  >
                    {tagOptions.length === 0 ? (
                      <option value="">该仓库暂无 tag</option>
                    ) : null}
                    {tagOptions.map((item) => (
                      <option key={item.tag} value={item.tag}>
                        {item.tag}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.refreshButton}
                    onClick={() => void tags.refresh()}
                    disabled={tags.isFetching}
                  >
                    {tags.isFetching ? "刷新中…" : "刷新"}
                  </button>
                </div>
              )}

              {!manual && selectedMeta ? (
                <span className={styles.commit}>
                  commit {shortWparseCommit(selectedMeta.commit)}
                  {selectedMeta.committedAt
                    ? ` · ${formatDateTime(selectedMeta.committedAt)}`
                    : ""}
                </span>
              ) : null}

              {allowManual ? (
                <label className={planStyles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={manual}
                    onChange={(event) => setManual(event.target.checked)}
                  />
                  <span>手动输入 tag（仅在列表不可用时使用）</span>
                </label>
              ) : null}

              {manual ? (
                <input
                  className={planStyles.input}
                  value={manualTag}
                  onChange={(event) => setManualTag(event.target.value)}
                  placeholder="v1.2.3"
                  maxLength={64}
                />
              ) : null}
              {manual && manualTag.trim() && !validWparseTag(manualTag) ? (
                <div className={planStyles.formError} role="alert">
                  tag 只能包含字母、数字、`.`、`_`、`-`，最长 64 个字符。
                </div>
              ) : null}
            </div>

            <div className={planStyles.block}>
              <div className={planStyles.blockHeader}>
                <span className={planStyles.blockTitle}>
                  目标网关（已选 {selectedIds.size} 台）
                </span>
                <span className={planStyles.sectionNote}>
                  默认勾选在线网关；最多 {maxTargets} 台，离线网关 60s 内未执行会过期
                </span>
              </div>
              {tooManyTargets ? (
                <div className={planStyles.formError} role="alert">
                  最多发布到 {maxTargets} 台，当前选了 {selectedIds.size} 台；请先取消一些目标。
                </div>
              ) : null}
              {gateways.length === 0 ? (
                <div className={planStyles.empty}>
                  暂无已接入的网关：先完成接入并等网关首次上报。
                </div>
              ) : (
                <div className={styles.gatewayList}>
                  {gateways.map((gateway) => (
                    <label key={gateway.gatewayId} className={styles.gatewayRow}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(gateway.gatewayId)}
                        onChange={() => toggleGateway(gateway.gatewayId)}
                      />
                      <span className={styles.gatewayId}>{gateway.gatewayId}</span>
                      <span className={styles.gatewayVersion}>{gateway.version}</span>
                      <GatewayOnlineStatusBadge value={gateway.status} />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className={planStyles.block}>
              <div className={planStyles.blockHeader}>
                <span className={planStyles.blockTitle}>发布说明</span>
                <span className={planStyles.sectionNote}>
                  可选；写入命令队列，便于回执与排障
                </span>
              </div>
              <input
                className={planStyles.input}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="center publish"
                maxLength={200}
              />
            </div>

            <div className={planStyles.formAction}>
              <PrimaryButton type="submit" disabled={!canSubmit}>
                {publish.isPending ? "发布中…" : "发布到所选网关"}
              </PrimaryButton>
            </div>
          </form>

          {publish.error ? (
            <ErrorBanner>发布失败：{describeError(publish.error)}</ErrorBanner>
          ) : null}

          {result ? (
            <div className={styles.result}>
              <div className={styles.resultHeader}>
                <strong>发布回执</strong>
                <span>
                  {result.repo} · {result.tag}
                  {result.commit ? ` · ${shortWparseCommit(result.commit)}` : ""}
                </span>
                {result.tagVerified ? (
                  <Badge tone="green">tag 已校验</Badge>
                ) : (
                  <Badge tone="amber">tag 未校验</Badge>
                )}
              </div>
              {result.targets.map((target) => (
                <WparsePublishTargetRow
                  key={target.gatewayId}
                  gatewayId={target.gatewayId}
                  commandId={target.commandId}
                  reused={target.reused}
                />
              ))}
              {result.errors.map((failure) => (
                <div key={failure.gatewayId} className={styles.targetError}>
                  {failure.gatewayId}：{failure.error}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

/** 逐网关轮询命令状态（终态自动停）。 */
function WparsePublishTargetRow({
  gatewayId,
  commandId,
  reused,
}: {
  gatewayId: string;
  commandId: string;
  reused: boolean;
}) {
  const query = useGatewayCommandStatus(gatewayId, commandId);
  const status = query.data;
  const state = status?.state ?? "pending";
  // `expired` 是“网关没取走”，对发布来说等同于失败；状态查询本身失败也要显式标红，
  // 不能一直显示“排队中”（那会让人以为还在等，其实状态接口已经挂了）。
  const tone = query.isError
    ? "red"
    : state === "expired"
      ? "red"
      : commandStateTone(state);
  const meta = query.isError
    ? `状态查询失败：${describeError(query.error)}`
    : [
        status?.response_status ? `HTTP ${status.response_status}` : null,
        reused ? "复用已有命令" : null,
        status?.error ?? null,
        status?.updated_at ? formatDateTime(status.updated_at) : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(" · ");
      const label = query.isError ? "状态未知" : commandStateLabel(state);

      return (
        <div className={styles.targetRow}>
          <span className={styles.targetMain}>{gatewayId}</span>
          <Badge tone={tone}>{label}</Badge>
      <span className={styles.targetMeta}>{meta || "等待 gwlinkd 取命令"}</span>
    </div>
  );
}


function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.detail ? `：${error.detail}` : "";
    if (error.status === 429) return `请求过于频繁，请稍后再试${detail}`;
    if (error.status === 401) return `需要有效的管理 token${detail}`;
    return `HTTP ${error.status}${detail}`;
  }
  return String(error);
}
