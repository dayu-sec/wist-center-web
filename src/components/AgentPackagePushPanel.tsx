import { useMemo, useState, type FormEvent } from "react";
import { AGENT_PACKAGE_PUSH_ACTION, jsonUpgradeSpec } from "../api";
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
import { selectGatewayUpgradeTargets } from "./gatewayUpgradeTargets";
import styles from "./PlanForm.module.css";

/** ② 只发这一个组件：把 `wist-agentd` 包交给网关包管理，**升不升由网关决定**。 */
const COMPONENTS = ["wist-agentd"] as const;

/** `datetime-local` 的默认截止（24h 后），转成控件要的 `YYYY-MM-DDTHH:mm`。 */
function defaultDeadlineLocal(): string {
  const at = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`;
}

/**
 * ② Agent 包下发：把**已托管**的 `wist-agentd` 包推送到选定网关的**包管理**。
 *
 * 与 ① 的区别在「谁决定升级」：① 由中心推下去安装；② 只把包交给网关，**升不升由网关决定**
 * （见设计 `edge/agent-package-push-to-gateways.md`）。计划本体仍是通用的灰度发布计划
 * （`action = push-agent-package`），所以**批准 / 推进 / 逐台进度**复用「发布执行」页。
 */
export function AgentPackagePushPanel() {
  const mutation = useCreateUpgradePlan();
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  const releases = useReleasesForComponents(COMPONENTS);
  const versions = releases.versions[COMPONENTS[0]] ?? [];

  const [version, setVersion] = useState("");
  const [phaseCount, setPhaseCount] = useState(3);
  // 执行约束（服务端要求 `deadline_at` 为 RFC3339、`timeout_seconds` 为正）。
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadlineLocal());
  const [timeoutSeconds, setTimeoutSeconds] = useState(1800);
  const [batchSize, setBatchSize] = useState(0);

  // 下发目标**自动确定**：机队（已接入并上报过、未归档）里排除明确离线的（与 ① 同一口径）。
  const fleet = useMemo(
    () => selectGatewayUpgradeTargets(gateways),
    [gateways],
  );
  const selected = fleet.targetIds;

  // 机队 / 版本只要有一头是**示例数据**，就不能拿去建计划（目标 id 与版本都不存在）。
  const exampleFleet = statusData?.source === "example";
  const exampleVersions = releases.source === "example";
  const exampleData = exampleFleet || exampleVersions;

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
      action: AGENT_PACKAGE_PUSH_ACTION,
      spec: jsonUpgradeSpec([
        { component: COMPONENTS[0], targetVersion: version },
      ]),
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
      title="创建 Agent 包下发计划"
      subtitle="选一个已托管的 wist-agentd 版本；网关目标自动确定（排除明确离线的）；中心把包交给网关包管理，是否升级由网关决定。"
    >
      <form onSubmit={handleSubmit}>
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>Agent 包版本（wist-agentd）</span>
            <span className={styles.sectionNote}>
              从「安装包管理」里已托管的版本中选
            </span>
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
            ["Agent 包", `${COMPONENTS[0]} ${version || "（包内版本）"}`],
            [
              "下发范围",
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
