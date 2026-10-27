import { useMemo, useState, type FormEvent } from "react";
import { jsonUpgradeSpec, type UpgradeTarget } from "../api";
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
} from "@dayu-sec/wist-web-core/release";
import { GatewayTargetBlock } from "./GatewayTargetBlock";
import { useGatewayTargets } from "./useGatewayTargets";
import { targetsMissingVersion } from "./gatewayUpgradeTargets";
import { UPGRADE_COMPONENTS } from "./releaseComponents";
import styles from "./PlanForm.module.css";

// ① 升级安装的目标组件（契约在 `releaseComponents`）：stack / gops / gx / gwlinkd。
// gwlinkd 是宿主侧常驻：中心把它当独立组件托管，gwlinkd 自己就地覆盖并在重启后核对版本回执。
const COMPONENTS = UPGRADE_COMPONENTS;

/** `datetime-local` 的默认截止（24h 后），转成控件要的 `YYYY-MM-DDTHH:mm`。 */
function defaultDeadlineLocal(): string {
  const at = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`;
}

/**
 * 创建升级计划：多组件目标版本 + **可选的网关目标** + **灰度阶段**。
 *
 * - **目标**：默认全选在线（排掉明确离线的），可以逐台取消 / 加回 —— 选中的就是本次范围；
 * - **灰度**：只选阶段数（2/3/4/5），网关按固定阶梯（1 台 → 10% → 30% → 70% → 全量）
 *   在**选中范围内**自动分配。推进一律人工确认。
 */
export function UpgradePlanCreatePanel() {
  const mutation = useCreateUpgradePlan();
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  const releases = useReleasesForComponents(COMPONENTS);
  const versionsByComponent = releases.versions;

  // 目标版本从已发布版本中选取（下拉）。
  function versionsFor(component: string): string[] {
    return versionsByComponent[component] ?? [];
  }

  const [targets, setTargets] = useState<UpgradeTarget[]>([
    { component: "wist-gateway-stack", targetVersion: "" },
  ]);
  // 执行约束（服务端要求 `deadline_at` 为 RFC3339、`timeout_seconds` 为正）。
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadlineLocal());
  const [timeoutSeconds, setTimeoutSeconds] = useState(1800);
  const [batchSize, setBatchSize] = useState(0);

  // 机队 / 版本只要有一头是**示例数据**，就不能拿去建计划：目标 id 与版本都是假的，
  // 中心要么回「unknown target(s)」、要么建出一份永远解析不出制品的空计划。
  const exampleFleet = statusData?.source === "example";
  const exampleVersions = releases.source === "example";
  const exampleData = exampleFleet || exampleVersions;

  // 升级目标：默认全选在线，可逐台取消 / 加回（选中范围就是灰度切分的范围）。
  const fleet = useGatewayTargets(gateways, exampleFleet);
  const selected = fleet.selected;

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

  // 阶段数按目标台数收窄（每段至少 1 台）；小目标就不再多轮。
  const phaseCounts = useMemo(
    () => availablePhaseCounts(selected.length),
    [selected.length],
  );
  const effectivePhaseCount = phaseCounts.includes(phaseCount)
    ? phaseCount
    : (phaseCounts[phaseCounts.length - 1] ?? phaseCount);

  // 阶段分配（纯派生，跟着目标与阶段数走）。
  const phasePlan = useMemo(
    () => planPhases(selected, effectivePhaseCount),
    [selected, effectivePhaseCount],
  );

  // 截止时间非法（空 / 残缺）直接禁提交：`new Date(...).toISOString()` 在 Invalid Date 上会抛。
  const deadline = new Date(deadlineLocal);
  const deadlineValid = !Number.isNaN(deadline.getTime());
  // 版本必选：中心按版本反查制品；留空派生不出地址（计划会永远 "已下发" 而没有任何反馈）。
  const missingVersion = targetsMissingVersion(targets);
  const canSubmit =
    !mutation.isPending &&
    !exampleData &&
    selected.length > 0 &&
    !phasePlan.error &&
    deadlineValid &&
    timeoutSeconds > 0 &&
    missingVersion.length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deadlineValid) return;
    // 阶段由**中心服务端**按阶梯切（与上面的预览同一套口径，权威在 `wist-release::rollout`），
    // 这里只给阶段数；目标版本落成 `spec` 的 JSON。
    mutation.mutate({
      action: "upgrade",
      spec: jsonUpgradeSpec(targets),
      targetIds: selected,
      phaseCount: effectivePhaseCount,
      deadlineAt: deadline.toISOString(),
      timeoutSeconds,
      batchSize,
    });
  }

  const plan = mutation.data?.data;

  return (
    <SectionCard
      title="创建升级计划"
      subtitle="选择多组件目标版本与要发布的网关（默认全选在线，可逐台改），灰度阶段在选中范围内按阶梯切分；批准后逐段推进。"
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
          {targets.length > 1 ? (
            <span className={styles.formNote}>
              网关一次只驱动第一个目标；要升多个组件请分别建计划。
            </span>
          ) : null}
        </div>

        <GatewayTargetBlock
          gateways={gateways}
          targetIds={selected}
          fleetSize={fleet.fleetSize}
          offlineCount={fleet.offlineCount}
          exampleFleet={exampleFleet}
          exampleVersions={exampleVersions}
          onToggle={fleet.toggle}
          onResetToDefault={fleet.resetToDefault}
          onClear={fleet.clear}
        />

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
            目标 {selected.length} 台，最多分{" "}
            {phaseCounts.length > 0 ? phaseCounts[phaseCounts.length - 1] : 0} 批 —— 每段至少 1 台，
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

        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>执行约束</span>
            <span className={styles.sectionNote}>
              截止时间为绝对时刻；超时为单台执行预算（秒）；每批并发 0 = 不节流
            </span>
          </div>
          <div className={styles.targetRow}>
            <input
              type="datetime-local"
              className={styles.input}
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
              required
            />
            <input
              type="number"
              min={1}
              className={styles.input}
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              placeholder="超时（秒）"
              required
            />
            <input
              type="number"
              min={0}
              className={styles.input}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              placeholder="每批并发（0=不节流）"
            />
          </div>
        </div>

        <div className={styles.formAction}>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {mutation.isPending ? "创建中…" : "创建升级计划"}
          </PrimaryButton>
        </div>
        {missingVersion.length > 0 ? (
          <div className={styles.formError} role="alert">
            请先选择目标版本：{missingVersion.join("、")}。
            中心按版本反查制品，留空无法下发。
          </div>
        ) : null}
      </form>
      {mutation.error ? (
        <ErrorBanner>创建失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {plan ? (
        <ReceiptCard
          title="灰度发布计划回执"
          fields={[
            ["计划 ID", plan.planId],
            [
              "目标",
              targets
                .map((t) => `${t.component} ${t.targetVersion}`)
                .join("，"),
            ],
            [
              "升级范围",
              `${plan.phases.reduce(
                (sum, phase) => sum + phase.targetIds.length,
                0,
              )} 个网关`,
            ],
            ["灰度阶段", `${plan.phases.length} 批`],
            ["状态", plan.status],
            ["创建时间", formatDateTime(plan.createdAt)],
          ]}
        />
      ) : null}
    </SectionCard>
  );
}
