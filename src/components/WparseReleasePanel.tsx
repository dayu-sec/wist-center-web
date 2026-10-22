import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api";
import {
  useGatewayStatusView,
  usePublishWparseRelease,
  useWparseRepos,
  useWparseTags,
} from "../hooks";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import planStyles from "./PlanForm.module.css";
import { Badge, ErrorBanner, PrimaryButton, ReceiptCard, SectionCard, formatDateTime } from "./ui";
import styles from "./WparseReleasePanel.module.css";
import {
  defaultWparseTag,
  shortWparseCommit,
  validWparseTag,
  wparsePlanTargetCount,
} from "./wparseRelease";

/**
 * 规则 / 配置发布入口（`wparse-rules` / `wparse-infra`）。
 *
 * 一个组件服务两个入口：repo 名从 props 来，repo 地址 / provider / token 全部由中心配置决定。
 *
 * 与 ①②③ 一致：这里只**建计划**（`draft`），真正下发要等「发布执行」页批准；
 * 批准后由中心经 wparse-proxy 入队，gwlinkd 的 relay 原样执行，不需要网关改动。
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
                {publish.isPending ? "创建中…" : "创建发布计划"}
              </PrimaryButton>
            </div>
          </form>

          {publish.error ? (
            <ErrorBanner>创建计划失败：{describeError(publish.error)}</ErrorBanner>
          ) : null}

          {result ? (
            <>
              <ReceiptCard
                title="发布计划回执（待审批）"
                fields={[
                  ["计划 ID", result.plan.planId],
                  ["仓库", `${result.repo}（${result.group}）`],
                  [
                    "tag",
                    `${result.tag}${
                      result.commit ? ` · ${shortWparseCommit(result.commit)}` : ""
                    }`,
                  ],
                  ["tag 校验", result.tagVerified ? "已校验" : "未校验"],
                  [
                    "目标",
                    `${wparsePlanTargetCount(result.plan)} 个网关`,
                  ],
                  ["状态", result.plan.status],
                  ["创建时间", formatDateTime(result.plan.createdAt)],
                ]}
              />
              <span className={planStyles.formNote}>
                计划已创建，但<strong>尚未下发</strong>：到「发布执行」页批准后，中心才会把 reload
                命令投给目标网关；逐台进度也在那里看。
              </span>
            </>
          ) : null}
        </>
      )}
    </SectionCard>
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
