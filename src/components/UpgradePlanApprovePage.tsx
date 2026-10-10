import {
  planStatusLabel,
  planStatusTone,
} from "@dayu-sec/wist-web-core/release";
import {
  useAdvanceUpgradePlan,
  useApproveUpgradePlan,
  useRetryUpgradePlan,
  useUpgradePlans,
} from "../hooks";
import { ApiError } from "../api";
import {
  Badge,
  ErrorBanner,
  LoadingDots,
  PageShell,
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
    if (error.status === 404)
      return "计划已不存在（HTTP 404）：刷新列表看看。";
    return `HTTP ${error.status}，请检查中心日志。`;
  }
  return "响应不符合当前契约，请检查中心与前端版本。";
}

/** 计划列表最多铺开多少条（按创建时间取最新的），避免历史计划把页面撑长。 */
const MAX_VISIBLE_PLANS = 5;

/**
 * 发布执行工作区：按计划列表逐项**批准**（draft → rolling，进入第一阶段）或**推进**
 * （rolling → 下一阶段）。两处人工闸门都落在这里 —— 金丝雀段一律人工确认。
 */
export function UpgradePlanApprovePage() {
  const { data, isLoading } = useUpgradePlans();
  const plans = data?.data ?? [];
  // 最新在前：接口不保证顺序，这里按 createdAt 倒序后只取最近 MAX_VISIBLE_PLANS 条。
  const visiblePlans = [...plans]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, MAX_VISIBLE_PLANS);
  const approve = useApproveUpgradePlan();
  const advance = useAdvanceUpgradePlan();
  const retry = useRetryUpgradePlan();
  const busy = approve.isPending || advance.isPending || retry.isPending;
  // 重派的回执：新计划就是「补跑计划」，页面要说清「重派成了哪一份」。
  const retried = retry.data?.data ?? null;

  return (
    <PageShell
      title="发布执行"
      summary="批准计划进入第一阶段，或按闸门人工推进到下一阶段（金丝雀段一律人工确认）；已失败的计划可按失败目标重派补跑计划。"
    >
      {isLoading && plans.length === 0 ? <LoadingDots /> : null}
      {retried ? (
        <div className={styles.retryNotice} role="status">
          已重派为补跑计划{" "}
          <code className={styles.retryPlanId}>{retried.planId}</code>
          {retried.phases[0]?.targetIds.length
            ? `（${retried.phases[0].targetIds.join("、")}）`
            : ""}
          ：新计划 id 才会让网关重驱（同一份计划改状态会被跳过），原计划保留为历史 ——
          补跑计划已在下面列表里，跟它即可。
        </div>
      ) : null}
      {retry.error ? (
        <ErrorBanner>重派失败：{retryErrorMessage(retry.error)}</ErrorBanner>
      ) : null}
      {plans.length === 0 ? (
        <div className={styles.empty}>暂无灰度发布计划。</div>
      ) : (
        <div className={styles.list}>
          {visiblePlans.map((plan) => {
            const total = plan.phases.reduce(
              (sum, phase) => sum + phase.targetIds.length,
              0,
            );
            // 只对**已终结失败**的计划给重试：滚动态先「推进」把当前阶段了结（失败也算了结）。
            const retryable = plan.status === "failed";
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
      {plans.length > MAX_VISIBLE_PLANS ? (
        <p className={styles.limitNote}>
          仅显示最新 {MAX_VISIBLE_PLANS} 条，共 {plans.length} 条计划。
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
