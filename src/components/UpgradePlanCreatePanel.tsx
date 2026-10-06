import { useMemo, useState, type FormEvent } from "react";
import type { UpgradeStep, UpgradeTarget } from "../api";
import {
  useCreateUpgradePlan,
  useGatewayStatusView,
  useReleasesForComponents,
} from "../hooks";
import {
  ErrorBanner,
  PrimaryButton,
  ReceiptCard,
  SectionCard,
  formatDateTime,
} from "./ui";
import {
  availablePhaseCounts,
  phaseScaleLabel,
  planPhases,
} from "./rolloutPhases";
import styles from "./UpgradePlanCreatePanel.module.css";

// ① 升级安装的目标组件：stack / gops / gx（agentd 走 ②「Agent 包下发」，由网关决定升级）。
const COMPONENTS = [
  "wist-gateway-stack",
  "galaxy-ops",
  "galaxy-flow",
] as const;

/**
 * 创建升级计划：多组件目标版本 + 网关范围 + **灰度阶段**。
 *
 * 灰度照 gateway-web 的口径：**只选阶段数**（2/3/4/5），网关按固定阶梯
 * （1 台 → 10% → 30% → 70% → 全量）**自动分配**，无需手填；推进一律人工确认。
 */
export function UpgradePlanCreatePanel() {
  const mutation = useCreateUpgradePlan();
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  const versionsByComponent = useReleasesForComponents(COMPONENTS);

  // 目标版本从已发布版本中选取（下拉）。
  function versionsFor(component: string): string[] {
    return versionsByComponent[component] ?? [];
  }

  const [targets, setTargets] = useState<UpgradeTarget[]>([
    { component: "wist-gateway-stack", targetVersion: "" },
  ]);
  const [selected, setSelected] = useState<string[]>([]);
  const [phaseCount, setPhaseCount] = useState(3);

  function updateTarget(index: number, patch: Partial<UpgradeTarget>) {
    setTargets((prev) =>
      prev.map((target, i) => (i === index ? { ...target, ...patch } : target)),
    );
  }
  function addTarget() {
    setTargets((prev) => [
      ...prev,
      { component: "wist-gateway-stack", targetVersion: "" },
    ]);
  }
  function removeTarget(index: number) {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }
  function toggleGateway(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function selectAllGateways() {
    setSelected(gateways.map((gateway) => gateway.gatewayId));
  }
  function clearGateways() {
    setSelected([]);
  }

  // 阶段数按目标台数收窄（每段至少 1 台）；小目标就不再多轮。
  const phaseCounts = useMemo(
    () => availablePhaseCounts(selected.length),
    [selected.length],
  );
  const effectivePhaseCount = phaseCounts.includes(phaseCount)
    ? phaseCount
    : (phaseCounts[phaseCounts.length - 1] ?? phaseCount);

  // 阶段分配（纯派生，跟着所选网关与阶段数走）。
  const phasePlan = useMemo(
    () => planPhases(selected, effectivePhaseCount),
    [selected, effectivePhaseCount],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 阶段 → 执行步骤：每步一群互不重叠的网关（人工确认后逐段推进）。
    const steps: UpgradeStep[] = phasePlan.phases.map((phase, index) => ({
      stepIndex: index,
      gatewayIds: phase.targetIds,
      status: "pending",
    }));
    mutation.mutate({
      targets,
      gatewayIds: selected,
      steps,
      requestedBy: "admin",
    });
  }

  const plan = mutation.data?.data;

  return (
    <SectionCard
      title="创建升级计划"
      subtitle="选择多组件目标版本与网关范围，灰度阶段按阶梯自动分配；批准后逐段推进。"
    >
      <form onSubmit={handleSubmit}>
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>升级目标（可多选）</span>
            <button type="button" className={styles.addButton} onClick={addTarget}>
              + 添加目标
            </button>
          </div>
          {targets.map((target, index) => (
            <div key={index} className={styles.targetRow}>
              <select
                className={styles.input}
                value={target.component}
                onChange={(e) =>
                  updateTarget(index, { component: e.target.value })
                }
              >
                {COMPONENTS.map((component) => (
                  <option key={component} value={component}>
                    {component}
                  </option>
                ))}
              </select>
              <select
                className={styles.input}
                value={target.targetVersion}
                onChange={(e) =>
                  updateTarget(index, { targetVersion: e.target.value })
                }
              >
                <option value="">
                  {versionsFor(target.component).length === 0
                    ? "该组件暂无已发布版本"
                    : "请选择已发布版本"}
                </option>
                {versionsFor(target.component).map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeTarget(index)}
                disabled={targets.length <= 1}
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>
              Gateway 范围（{selected.length} 已选）
            </span>
            <span className={styles.blockActions}>
              <button
                type="button"
                className={styles.addButton}
                onClick={selectAllGateways}
                disabled={gateways.length === 0}
              >
                全选
              </button>
              <button
                type="button"
                className={styles.addButton}
                onClick={clearGateways}
                disabled={selected.length === 0}
              >
                清空
              </button>
            </span>
          </div>
          {gateways.length === 0 ? (
            <div className={styles.empty}>暂无网关。</div>
          ) : (
            <div className={styles.gatewayGrid}>
              {gateways.map((gateway) => (
                <label key={gateway.gatewayId} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={selected.includes(gateway.gatewayId)}
                    onChange={() => toggleGateway(gateway.gatewayId)}
                  />
                  <span>
                    {gateway.gatewayId}
                    <span className={styles.checkboxSub}>{gateway.version}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>灰度阶段</span>
            <span className={styles.sectionNote}>
              选阶段数即可 —— 按 1 台 → 10% → 30% → 70% → 全量的阶梯自动分配网关
            </span>
          </div>

          {phaseCounts.length > 0 ? (
            <div className={styles.countTabs} role="group" aria-label="灰度阶段数">
              {phaseCounts.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={
                    count === effectivePhaseCount
                      ? `${styles.countTab} ${styles.countTabActive}`
                      : styles.countTab
                  }
                  aria-pressed={count === effectivePhaseCount}
                  onClick={() => setPhaseCount(count)}
                >
                  {count} 阶段
                </button>
              ))}
            </div>
          ) : null}

          <span className={styles.formNote}>
            已选 {selected.length} 个网关，最多分{" "}
            {phaseCounts.length > 0 ? phaseCounts[phaseCounts.length - 1] : 0} 批 —— 每段至少 1 个，
            按排序后的 gateway_id 依次切片、互不重叠（一个网关只升一次）。推进一律人工确认。
          </span>

          {phasePlan.error ? (
            <div className={styles.formError} role="alert">
              {phasePlan.error}
            </div>
          ) : (
            <ol className={styles.phaseList}>
              {phasePlan.phases.map((phase) => (
                <li key={phase.index} className={styles.phaseItem}>
                  <div className={styles.phaseRail} aria-hidden="true">
                    <span
                      className={`${styles.railDot} ${
                        phase.isCanary
                          ? styles.railDotCanary
                          : phase.isFinal
                            ? styles.railDotFinal
                            : ""
                      }`}
                    >
                      {phase.index}
                    </span>
                    <span className={styles.railLine} />
                  </div>
                  <div className={styles.phaseBody}>
                    <div className={styles.phaseTop}>
                      <span className={styles.phaseIndex}>第 {phase.index} 批</span>
                      <span
                        className={`${styles.phaseScale} ${
                          phase.isCanary
                            ? styles.phaseScaleCanary
                            : phase.isFinal
                              ? styles.phaseScaleFinal
                              : ""
                        }`}
                      >
                        {phase.isFinal ? "全量（剩余）" : phaseScaleLabel(phase)}
                      </span>
                      <span className={styles.phaseMeta}>
                        新增 {phase.targetIds.length} 个
                      </span>
                    </div>
                    <div className={styles.phaseGateways}>
                      {phase.targetIds.map((id) => (
                        <span key={id} className={styles.gatewayChip}>
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.formAction}>
          <PrimaryButton
            type="submit"
            disabled={
              mutation.isPending ||
              selected.length === 0 ||
              Boolean(phasePlan.error)
            }
          >
            {mutation.isPending ? "创建中…" : "创建升级计划"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>创建失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {plan ? (
        <ReceiptCard
          title="升级计划回执"
          fields={[
            ["计划 ID", plan.planId],
            [
              "目标",
              plan.targets
                .map((t) => `${t.component} ${t.targetVersion}`)
                .join("，"),
            ],
            ["升级范围", `${plan.targetCount} 个网关`],
            ["执行步骤", `${plan.steps.length} 批灰度`],
            ["状态", plan.status],
            ["创建时间", formatDateTime(plan.createdAt)],
          ]}
        />
      ) : null}
    </SectionCard>
  );
}
