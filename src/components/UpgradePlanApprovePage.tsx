import { useState } from "react";
import {
  planStatusLabel,
  planStatusTone,
} from "@dayu-sec/wist-web-core/release";
import {
  useAdvanceUpgradePlan,
  useApproveUpgradePlan,
  useRetryUpgradePlan,
  useSetPlanArchived,
  useUpgradePlans,
} from "../hooks";
import { ApiError } from "../api";
import {
  Badge,
  ErrorBanner,
  LoadingDots,
  PageShell,
  formatDateTime,
  rolloutToneToBadge,
} from "./ui";
import { UpgradePlanEntries } from "./UpgradePlanEntries";
import styles from "./UpgradePlanApprovePage.module.css";

/** `spec` 是 `{"targets":[{"component","target_version"}]}`；解不出时原样展示。 */
function specSummary(spec: string): string {
  try {
    const parsed = JSON.parse(spec) as {
      targets?: { component?: string; target_version?: string }[];
    };
    const targets = parsed.targets ?? [];
    if (targets.length === 0) return "（无目标版本）";
    return targets
      .map((t) => `${t.component ?? "?"} ${t.target_version || "（包内版本）"}`)
      .join("，");
  } catch {
    return spec;
  }
}

/**
 * 重派失败的原因。
 *
 * 两种状态码各有明确处置：**409** = 这份计划不是「已终结失败」（滚动态得先「推进」把当前阶段
 * 了结，失败也算了结）；**400** = 指名的目标里没有失败项（或目标已不存在）。
 */
function retryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "这份计划不是「已失败」终态（HTTP 409）：滚动中的计划请先「推进」把当前阶段了结（失败也算了结）后再重试。";
    if (error.status === 400)
      return "没有可重试的失败目标（HTTP 400）：刷新页面，按当前逐目标进度重试。";
    if (error.status === 404) return "计划已不存在（HTTP 404）：刷新列表看看。";
    return `HTTP ${error.status}，请检查中心日志。`;
  }
  return "响应不符合当前契约，请检查中心与前端版本。";
}

/** 归档失败的原因：409 = 计划还没终结（draft / rolling 不能藏起来）。 */
function archiveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "只有已终结（完成 / 失败 / 取消）的计划能归档（HTTP 409）：执行中的计划请先「推进」到了结。";
    if (error.status === 404)
      return "计划已不存在，或中心版本还不支持归档（HTTP 404）：刷新列表 / 检查中心版本。";
    return `HTTP ${error.status}，请检查中心日志。`;
  }
  return "响应不符合当前契约，请检查中心与前端版本。";
}

/** 终结态才可归档；draft / rolling 还得批准 / 推进，藏起来会找不到入口。 */
function isArchivableStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** 计划列表最多铺开多少条（按创建时间取最新的），避免历史计划把页面撑长。 */
const MAX_VISIBLE_PLANS = 5;

/**
 * 发布执行工作区：按计划列表逐项**批准**（draft → rolling，进入第一阶段）或**推进**
 * （rolling → 下一阶段）。两处人工闸门都落在这里 —— 金丝雀段一律人工确认。
 */
export function UpgradePlanApprovePage() {
  // 取全量（含已归档）：页面自己分「执行记录 / 已归档」，归档后卡片能立刻换分区。
  const { data, isLoading } = useUpgradePlans(true);
  const plans = data?.data ?? [];
  const [scope, setScope] = useState<"active" | "archived">("active");
  const activePlans = plans.filter((plan) => !plan.archivedAt);
  const archivedPlans = plans.filter((plan) => Boolean(plan.archivedAt));
  const scopedPlans = scope === "archived" ? archivedPlans : activePlans;
  // 最新在前：接口不保证顺序，这里按 createdAt 倒序后只取最近 MAX_VISIBLE_PLANS 条。
  const visiblePlans = [...scopedPlans]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, MAX_VISIBLE_PLANS);
  const approve = useApproveUpgradePlan();
  const advance = useAdvanceUpgradePlan();
  const retry = useRetryUpgradePlan();
  const archive = useSetPlanArchived();
  const busy =
    approve.isPending ||
    advance.isPending ||
    retry.isPending ||
    archive.isPending;
  // 重派的回执：新计划就是「补跑计划」，页面要说清「重派成了哪一份」。
  const retried = retry.data?.data ?? null;

  return (
    <PageShell
      title="发布执行"
      summary="批准计划进入第一阶段，或按闸门人工推进到下一阶段（金丝雀段一律人工确认）；已失败的计划可按失败目标重派补跑计划，终结的计划可归档收起。"
    >
      {isLoading && plans.length === 0 ? <LoadingDots /> : null}
      {plans.length > 0 ? (
        <div
          className={styles.scopeTabs}
          role="tablist"
          aria-label="执行记录范围"
        >
          <button
            type="button"
            role="tab"
            id="scope-active-tab"
            aria-selected={scope === "active"}
            aria-controls="rollout-plan-list"
            className={
              scope === "active"
                ? `${styles.scopeTab} ${styles.scopeTabActive}`
                : styles.scopeTab
            }
            onClick={() => setScope("active")}
          >
            执行记录
            <span className={styles.scopeCount}>{activePlans.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="scope-archived-tab"
            aria-selected={scope === "archived"}
            aria-controls="rollout-plan-list"
            className={
              scope === "archived"
                ? `${styles.scopeTab} ${styles.scopeTabActive}`
                : styles.scopeTab
            }
            onClick={() => setScope("archived")}
          >
            已归档
            <span className={styles.scopeCount}>{archivedPlans.length}</span>
          </button>
        </div>
      ) : null}
      {retried ? (
        <div className={styles.retryNotice} role="status">
          已重派为补跑计划{" "}
          <code className={styles.retryPlanId}>{retried.planId}</code>
          {retried.phases[0]?.targetIds.length
            ? `（${retried.phases[0].targetIds.join("、")}）`
            : ""}
          ：新计划 id
          才会让网关重驱（同一份计划改状态会被跳过），原计划保留为历史 ——
          补跑计划已在下面列表里，跟它即可。
        </div>
      ) : null}
      {retry.error ? (
        <ErrorBanner>重派失败：{retryErrorMessage(retry.error)}</ErrorBanner>
      ) : null}
      {archive.error ? (
        <ErrorBanner>
          归档失败：{archiveErrorMessage(archive.error)}
        </ErrorBanner>
      ) : null}
      {plans.length === 0 ? (
        <div className={styles.empty}>暂无灰度发布计划。</div>
      ) : scopedPlans.length === 0 ? (
        <div
          className={styles.empty}
          id="rollout-plan-list"
          role="tabpanel"
          aria-labelledby={`scope-${scope}-tab`}
        >
          {scope === "archived"
            ? "暂无已归档的执行记录。终结（完成 / 失败 / 取消）的计划可在卡片右上角归档。"
            : "暂无执行记录；已归档的见「已归档」。"}
        </div>
      ) : (
        <div
          className={styles.list}
          id="rollout-plan-list"
          role="tabpanel"
          aria-labelledby={`scope-${scope}-tab`}
        >
          {visiblePlans.map((plan) => {
            const total = plan.phases.reduce(
              (sum, phase) => sum + phase.targetIds.length,
              0,
            );
            const archived = Boolean(plan.archivedAt);
            const archivable = isArchivableStatus(plan.status);
            const archivePending =
              archive.isPending && archive.variables?.planId === plan.planId;
            // 只对**已终结失败**的计划给重试：滚动态先「推进」把当前阶段了结（失败也算了结）；
            // 已归档的记录是收起来的，不在这里重派。
            const retryable = plan.status === "failed" && !archived;
            return (
              <div key={plan.planId} className={styles.item}>
                <div className={styles.itemHead}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>{plan.planId}</div>
                    <div className={styles.itemSub}>
                      {specSummary(plan.spec)}
                      {" · "}
                      {total} 个网关 · {plan.phases.length} 阶段
                      {plan.status === "rolling"
                        ? ` · 当前第 ${plan.currentPhase} 阶段`
                        : ""}
                      {archived && plan.archivedAt
                        ? ` · 归档于 ${formatDateTime(plan.archivedAt)}`
                        : ""}
                    </div>
                  </div>
                  <Badge tone={rolloutToneToBadge(planStatusTone(plan.status))}>
                    {planStatusLabel(plan.status)}
                  </Badge>
                  {plan.status === "draft" ? (
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={busy}
                      onClick={() => approve.mutate({ planId: plan.planId })}
                    >
                      {approve.isPending ? "批准中…" : "批准"}
                    </button>
                  ) : null}
                  {plan.status === "rolling" ? (
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={busy}
                      onClick={() => advance.mutate({ planId: plan.planId })}
                    >
                      {advance.isPending ? "推进中…" : "推进"}
                    </button>
                  ) : null}
                  {retryable ? (
                    <button
                      type="button"
                      className={styles.retryButton}
                      disabled={busy}
                      onClick={() => retry.mutate({ planId: plan.planId })}
                      title="为该计划的失败目标新建一份补跑计划（原计划保留为历史）"
                    >
                      {retry.isPending ? "重派中…" : "重试失败项"}
                    </button>
                  ) : null}
                  {archived ? (
                    <button
                      type="button"
                      className={`${styles.archiveButton} ${styles.archiveButtonRestore}`}
                      disabled={busy}
                      onClick={() =>
                        archive.mutate({
                          planId: plan.planId,
                          archived: false,
                        })
                      }
                      title="恢复为普通执行记录（计划与逐目标条目都还在）"
                    >
                      {archivePending ? "处理中…" : "取消归档"}
                    </button>
                  ) : archivable ? (
                    <button
                      type="button"
                      className={styles.archiveButton}
                      disabled={busy}
                      onClick={() =>
                        archive.mutate({ planId: plan.planId, archived: true })
                      }
                      title="从执行记录里收起（计划和条目全留，可随时取消归档）"
                    >
                      {archivePending ? "处理中…" : "归档"}
                    </button>
                  ) : null}
                </div>
                <UpgradePlanEntries
                  planId={plan.planId}
                  status={plan.status}
                  retryable={retryable}
                  retryPending={retry.isPending}
                  onRetryTarget={(targetId) =>
                    retry.mutate({ planId: plan.planId, targetIds: [targetId] })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      {scopedPlans.length > MAX_VISIBLE_PLANS ? (
        <p className={styles.limitNote}>
          仅显示最新 {MAX_VISIBLE_PLANS} 条，共 {scopedPlans.length} 条
          {scope === "archived" ? "已归档记录" : "执行记录"}。
        </p>
      ) : null}
      {approve.error ? (
        <ErrorBanner>批准失败：{String(approve.error)}</ErrorBanner>
      ) : null}
      {advance.error ? (
        <ErrorBanner>推进失败：{String(advance.error)}</ErrorBanner>
      ) : null}
    </PageShell>
  );
}
