import { useMemo, useState, type FormEvent } from "react";
import { useCreateUpgradePlan, useGatewayStatusView, useReleasesForComponents } from "../hooks";
import {
  ErrorBanner,
  PrimaryButton,
  ReceiptCard,
  SectionCard,
  formatDateTime,
} from "./ui";
import { availablePhaseCounts, phaseScaleLabel, planPhases } from "@dayu-sec/wist-web-core/release";
import { GatewayTargetBlock } from "./GatewayTargetBlock";
import { useGatewayTargets } from "./useGatewayTargets";
import styles from "./PlanForm.module.css";

/**
 * 通用的「把已托管的包推给网关」面板（发布页复用）。
 *
 * 与 ① 升级安装的区别在「谁决定升级 / 生效」：本面板只把包交给网关（包管理 / 知识库管理），
 * 由网关决定是否使用。计划本体仍是通用灰度发布计划，所以**批准 / 推进 / 逐台进度**
 * 复用「发布执行」页。
 *
 * 两种落地共用这一份表单，差别只有三处（由 props 表达）：
 *   - `action`：计划动作值（`push-agent-package` / `push-knowledge-package`）；
 *   - `buildSpec`：动作参数（知识库多一个 `activate`）；
 *   - `activateOption`：是否显示「录入后立即激活」开关。
 */
export interface PackagePushPanelProps {
  action: string;
  /** 只发一个组件（与后端 `GatewayUpgradePlan` 的单组件目标一致）。 */
  component: string;
  title: string;
  subtitle: string;
  /** 版本选择块的标题，如「Agent 包版本（wist-agentd）」。 */
  versionLabel: string;
  /** 动作参数拼装：`activate` 只在 `activateOption` 时由用户勾选。 */
  buildSpec: (component: string, version: string, activate: boolean) => string;
  /** 是否显示「录入后立即激活」开关（知识库：录入 ≠ 生效）。 */
  activateOption?: boolean;
}

/** `datetime-local` 的默认截止（24h 后），转成控件要的 `YYYY-MM-DDTHH:mm`。 */
function defaultDeadlineLocal(): string {
  const at = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`;
}

export function PackagePushPanel({
  action,
  component,
  title,
  subtitle,
  versionLabel,
  buildSpec,
  activateOption = false,
}: PackagePushPanelProps) {
  const mutation = useCreateUpgradePlan();
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  const releases = useReleasesForComponents([component]);
  const versions = releases.versions[component] ?? [];

  const [version, setVersion] = useState("");
  const [activate, setActivate] = useState(false);
  const [phaseCount, setPhaseCount] = useState(3);
  // 执行约束（服务端要求 `deadline_at` 为 RFC3339、`timeout_seconds` 为正）。
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadlineLocal());
  const [timeoutSeconds, setTimeoutSeconds] = useState(1800);
  const [batchSize, setBatchSize] = useState(0);

  // 机队 / 版本只要有一头是**示例数据**，就不能拿去建计划（目标 id 与版本都不存在）。
  const exampleFleet = statusData?.source === "example";
  const exampleVersions = releases.source === "example";
  const exampleData = exampleFleet || exampleVersions;

  // 下发目标：默认全选在线，可逐台取消 / 加回（选中范围就是灰度切分的范围）。
  const fleet = useGatewayTargets(gateways, exampleFleet);
  const selected = fleet.selected;

  // 阶段数按目标台数收窄（每段至少 1 台）；小目标就不再多轮。
  const phaseCounts = useMemo(() => availablePhaseCounts(selected.length), [selected.length]);
  const effectivePhaseCount = phaseCounts.includes(phaseCount)
    ? phaseCount
    : (phaseCounts[phaseCounts.length - 1] ?? phaseCount);

  // 阶段分配（纯派生，跟着所选网关与阶段数走）。
  const phasePlan = useMemo(
    () => planPhases(selected, effectivePhaseCount),
    [selected, effectivePhaseCount],
  );

  // 截止时间非法（空 / 残缺）直接禁提交：`new Date(...).toISOString()` 在 Invalid Date 上会抛。
  const deadline = new Date(deadlineLocal);
  const deadlineValid = !Number.isNaN(deadline.getTime());
  // 版本必选：中心按 `(component, target_version)` 反查已发布制品；空版本派生不出地址。
  const canSubmit =
    !mutation.isPending &&
    !exampleData &&
    version !== "" &&
    selected.length > 0 &&
    !phasePlan.error &&
    deadlineValid &&
    timeoutSeconds > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deadlineValid || version === "") return;
    // 阶段由**中心服务端**按阶梯切；这里只给阶段数。版本落成 `spec`（与升级同形的 `{"targets":[…]}`）。
    mutation.mutate({
      action,
      spec: buildSpec(component, version, activate),
      targetIds: selected,
      phaseCount: effectivePhaseCount,
      deadlineAt: deadline.toISOString(),
      timeoutSeconds,
      batchSize,
    });
  }

  const plan = mutation.data?.data;

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <form onSubmit={handleSubmit}>
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>{versionLabel}</span>
            <span className={styles.sectionNote}>从「安装包管理」里已托管的版本中选</span>
          </div>
          <select
            className={styles.input}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">
              {versions.length === 0 ? "该组件暂无已托管版本" : "请选择已托管版本"}
            </option>
            {versions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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

        {activateOption ? (
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockTitle}>生效方式</span>
              <span className={styles.sectionNote}>录入 ≠ 生效；激活后网关才按新目录派活</span>
            </div>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
              />
              <span>录入后立即激活（切生效指针）</span>
            </label>
          </div>
        ) : null}

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
            按排序后的 gateway_id 依次切片、互不重叠（一个网关只发一次）。推进一律人工确认。
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
                      <span className={styles.phaseMeta}>新增 {phase.targetIds.length} 个</span>
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
            {mutation.isPending ? "创建中…" : "创建下发计划"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>创建失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {plan ? (
        <ReceiptCard
          title="发布计划回执"
          fields={[
            ["计划 ID", plan.planId],
            ["包", `${component} ${version || "（包内版本）"}`],
            [
              "下发范围",
              `${plan.phases.reduce((sum, phase) => sum + phase.targetIds.length, 0)} 个网关`,
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
