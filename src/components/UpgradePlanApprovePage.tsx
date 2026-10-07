import {
  planStatusLabel,
  planStatusTone,
  type RolloutTone,
} from "@dayu-sec/wist-web-core/release";
import {
  useAdvanceUpgradePlan,
  useApproveUpgradePlan,
  useUpgradePlans,
} from "../hooks";
import { Badge, ErrorBanner, LoadingDots, PageShell, type BadgeTone } from "./ui";
import { UpgradePlanEntries } from "./UpgradePlanEntries";
import styles from "./UpgradePlanApprovePage.module.css";

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
 * 计划执行工作区：按计划列表逐项**批准**（draft → rolling，进入第一阶段）或**推进**
 * （rolling → 下一阶段）。两处人工闸门都落在这里 —— 金丝雀段一律人工确认。
 */
export function UpgradePlanApprovePage() {
  const { data, isLoading } = useUpgradePlans();
  const plans = data?.data ?? [];
  const approve = useApproveUpgradePlan();
  const advance = useAdvanceUpgradePlan();
  const busy = approve.isPending || advance.isPending;

  return (
    <PageShell
      title="计划执行"
      summary="批准计划进入第一阶段，或按闸门人工推进到下一阶段（金丝雀段一律人工确认）。"
    >
      {isLoading && plans.length === 0 ? <LoadingDots /> : null}
      {plans.length === 0 ? (
        <div className={styles.empty}>暂无灰度发布计划。</div>
      ) : (
        <div className={styles.list}>
          {plans.map((plan) => {
            const total = plan.phases.reduce(
              (sum, phase) => sum + phase.targetIds.length,
              0,
            );
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
                  <Badge tone={toneToBadge(planStatusTone(plan.status))}>
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
                </div>
                <UpgradePlanEntries planId={plan.planId} status={plan.status} />
              </div>
            );
          })}
        </div>
      )}
      {approve.error ? (
        <ErrorBanner>批准失败：{String(approve.error)}</ErrorBanner>
      ) : null}
      {advance.error ? (
        <ErrorBanner>推进失败：{String(advance.error)}</ErrorBanner>
      ) : null}
    </PageShell>
  );
}
