import { Link, useParams } from "react-router-dom";
import type { LifecycleEvent } from "../api";
import {
  useAgentHistories,
  useGatewayAgents,
  useGatewayHistory,
  useGatewayLifecycle,
  useGatewayStatus,
  useGatewayUptimes,
} from "../hooks";
import {
  Badge,
  formatBytes,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  lifecycleLabel,
  lifecycleTone,
  LoadingDots,
  PageShell,
} from "./ui";
import { GatewayHealthBadge } from "./GatewayHealthBadge";
import { GatewayHistoryChart } from "./GatewayHistoryChart";
import { GatewayManualUpgradePanel } from "./GatewayManualUpgradePanel";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import { GatewayVersionText } from "./GatewayVersionText";
import styles from "./GatewayDetailPage.module.css";

export function GatewayDetailPage() {
  const { gatewayId = "" } = useParams();
  const { data: statusData, isLoading } = useGatewayStatus(gatewayId);
  const { data: agentsData } = useGatewayAgents(gatewayId);
  const agentIds = agentsData?.data?.map((agent) => agent.agentId) ?? [];
  const { data: agentHistoriesData } = useAgentHistories(gatewayId, agentIds);
  const { data: historyData, isLoading: isHistoryLoading } =
    useGatewayHistory(gatewayId);
  const { data: uptimesData } = useGatewayUptimes([gatewayId]);
  const { data: lifecycleData } = useGatewayLifecycle(gatewayId);
  const lifecycle = lifecycleData?.data ?? [];

  const gateway = statusData?.data ?? null;
  const agents = agentsData?.data ?? [];
  const uptime = gatewayId ? uptimesData?.[gatewayId] : undefined;
  const uptimeText =
    uptime === null || uptime === undefined
      ? "—"
      : `${(uptime * 100).toFixed(1)}%`;
  // 当前生命周期状态 = 最近一次转变的目标状态（明显位置展示）。
  const chain = lifecycleChain(lifecycle);
  const currentState =
    lifecycle.length > 0 ? lifecycle[lifecycle.length - 1].toState : null;

  return (
    <PageShell
      title={gateway ? `网关 ${gateway.gatewayId}` : "网关详情"}
      summary="查看该网关的状态与上报的 Agent 状态；重新安装所需的接入材料在「接入材料」页。"
    >
      <Link to="/" className={styles.backLink}>
        ← 返回网关态势
      </Link>

      {isLoading && !gateway ? <LoadingDots /> : null}

      {gateway ? (
        <section className={styles.section}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.headerRow}>
                <div className={styles.gatewayId}>{gateway.gatewayId}</div>
                {currentState ? (
                  <Badge tone={lifecycleTone(currentState)}>
                    {lifecycleLabel(currentState)}
                  </Badge>
                ) : null}
              </div>
              <div className={styles.instanceId}>{gateway.instanceId}</div>
            </div>
            {/* 14 项按语义分三组：连接 / 规模与版本 / 资源。原来铺成一张 5 列大表，
                行与行之间没有关系、也看不出哪几项是最该看的（现场反馈「不太美观」）。
                在线率与 Agent 在线数是**主指标**，字号单独提一档。 */}
            <div className={styles.metricGroups}>
              <section className={styles.metricGroup}>
                <h3 className={styles.groupTitle}>连接</h3>
                <div className={styles.metricGrid}>
                  <Metric label="状态">
                    <GatewayOnlineStatusBadge value={gateway.status} />
                  </Metric>
                  <Metric label="健康">
                    <GatewayHealthBadge value={gateway.health} />
                  </Metric>
                  <Metric label="在线率（1h）" primary>
                    {uptimeText}
                  </Metric>
                  <Metric label="最后上报">
                    {formatRelativeTime(gateway.lastSeenAt)}
                  </Metric>
                </div>
              </section>

              <section className={styles.metricGroup}>
                <h3 className={styles.groupTitle}>规模与版本</h3>
                <div className={styles.metricGrid}>
                  <Metric label="版本">
                    <GatewayVersionText value={gateway.version} />
                  </Metric>
                  <Metric label="gops">{gateway.gopsVersion ?? "—"}</Metric>
                  <Metric label="gx">{gateway.gxVersion ?? "—"}</Metric>
                  <Metric label="Agent 在线 / 离线" primary>
                    {gateway.onlineAgents ?? "—"} / {gateway.offlineAgents ?? "—"}
                    <span className={styles.metricSub}>
                      （共 {gateway.agentCount ?? "—"}）
                    </span>
                  </Metric>
                  <Metric label="运行时长">
                    {formatDuration(gateway.uptimeSeconds)}
                  </Metric>
                  <Metric label="数据面接收（累计）">
                    收 {gateway.ingestAcceptedTotal ?? "—"} / 拒{" "}
                    {gateway.ingestRejectedTotal ?? "—"}
                  </Metric>
                </div>
              </section>

              <section className={styles.metricGroup}>
                <h3 className={styles.groupTitle}>资源</h3>
                <div className={styles.metricGrid}>
                  <Metric label="内存">
                    {formatBytes(gateway.memoryBytes)}
                  </Metric>
                  <Metric label="CPU">
                    {formatPercent(gateway.cpuPercent)}
                  </Metric>
                  <Metric label="磁盘">
                    {formatPercent(gateway.diskUsagePercent)}
                  </Metric>
                  <Metric label="负载（1m）">
                    {gateway.load1m === null ? "—" : gateway.load1m.toFixed(2)}
                  </Metric>
                  <Metric label="存储">
                    {formatBytes(gateway.storeBytes)}
                  </Metric>
                  <Metric label="主机内存">
                    {formatBytes(gateway.memoryTotalBytes)}
                  </Metric>
                </div>
              </section>
            </div>
            <div className={styles.chartBlock}>
              <GatewayHistoryChart
                history={historyData?.data}
                loading={isHistoryLoading}
                source={historyData?.source}
              />
            </div>
          </div>
        </section>
      ) : null}

      {gateway ? (
        <section className={styles.section}>
          <GatewayManualUpgradePanel
            gatewayId={gateway.gatewayId}
            gatewayStatus={gateway.status}
          />
        </section>
      ) : null}

      {/*
        这台页面只有**已上报**的网关才进得来（状态接口对「从未上报」回 404，`gateway` 就不会有值），
        也就是**已经接入成功**的网关 —— 所以这里不再铺「安装代码 / 接入券」：那两样是给
        **还没接入**的机器（或重装）用的。以前这里是一整张卡片讲「不需要安装材料」，占掉半屏却什么
        也没提供（现场反馈「这个展示也有问题」）—— 现在收成一行提示，只留「接入材料」这个入口。
      */}
      {gateway ? (
        <p className={styles.installedNote}>
          <span className={styles.installedIcon} aria-hidden="true">
            ✓
          </span>
          这台网关已完成接入并在上报（上面的状态就是它自己报的）。脚本安装命令与一次性接入券只在
          <strong>重新安装</strong>时才用得到：
          <Link
            className={styles.installedLink}
            to={`/instance/${encodeURIComponent(gateway.gatewayId)}`}
          >
            接入材料（打开会轮换接入券，旧券立即作废）
            <span aria-hidden="true"> →</span>
          </Link>
        </p>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>生命周期过程</div>
          <span className={styles.sectionMeta}>{lifecycle.length} 次转变</span>
        </div>
        {chain.length === 0 ? (
          <div className={styles.empty}>尚无生命周期记录。</div>
        ) : (
          /*
            状态迁移的经典表达：**节点是状态、不是转变记录**，**横向**排开（从左到右就是时间顺序）。
            每个状态一列：圆点在一条横轨上，下面状态名，再下面「什么时候到这个状态」；末列是当前态。
          */
          <ol
            className={styles.chain}
            style={{ "--steps": chain.length } as React.CSSProperties}
          >
            {chain.map((step, index) => {
              const isCurrent = index === chain.length - 1;
              return (
                <li
                  key={`${step.state ?? "created"}-${index}`}
                  className={
                    isCurrent
                      ? `${styles.chainStep} ${styles.chainStepCurrent}`
                      : styles.chainStep
                  }
                >
                  <span
                    className={styles.chainDot}
                    data-tone={lifecycleTone(step.state ?? "")}
                    aria-hidden="true"
                  />
                  <span className={styles.chainLabel}>
                    {step.label}
                    {isCurrent ? (
                      <span className={styles.chainNow}>当前</span>
                    ) : null}
                  </span>
                  <span className={styles.chainTime}>
                    {step.arrivedAt ? formatRelativeTime(step.arrivedAt) : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Agent 状态</div>
          <span className={styles.sectionMeta}>{agents.length} 个</span>
        </div>
        {agents.length === 0 ? (
          <div className={styles.empty}>该网关尚未上报 Agent 状态。</div>
        ) : (
          <div className={styles.agentGrid}>
            {agents.map((agent) => (
              <div key={agent.agentId} className={styles.agentCard}>
                <div className={styles.agentHeader}>
                  <div className={styles.agentId}>{agent.agentId}</div>
                  <GatewayOnlineStatusBadge value={agent.status} />
                </div>
                <div className={styles.agentMeta}>
                  <span>版本 {agent.version}</span>
                  <GatewayHealthBadge value={agent.health} />
                </div>
                <div className={styles.agentMetrics}>
                  <span>内存 {formatBytes(agent.memoryBytes)}</span>
                  <span>CPU {formatPercent(agent.cpuPercent)}</span>
                  <span>时延 {agent.adminLatencyMs ?? "—"}ms</span>
                </div>
                <GatewayHistoryChart
                  history={agentHistoriesData?.[agent.agentId]?.data}
                  source={agentHistoriesData?.[agent.agentId]?.source}
                  compact
                  title="Agent 最近 1 小时"
                />
                <div className={styles.agentLastSeen}>
                  {formatRelativeTime(agent.lastSeenAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

interface ChainStep {
  /** 生命周期状态；`null` = 创建（还没进入任何状态）。 */
  state: string | null;
  label: string;
  /** 进入该状态的时刻；创建那一格没有（它是第一个转变的 from）。 */
  arrivedAt: string | null;
}

/**
 * 把「一次转变一条」的记录折成**状态链**：每个状态一个节点，相邻重复的状态合并。
 *
 * 为什么不是逐条列出转变：`A → B` 与 `B → C` 两条记录会让 B 出现两次，读起来像流水账；
 * 状态迁移的经典画法是**状态是节点、转变是边**，这里按时间顺序把走过的状态串成一条链，
 * 每个节点标「什么时候到这个状态」，最后一个节点就是当前态。
 */
function lifecycleChain(events: LifecycleEvent[]): ChainStep[] {
  const steps: ChainStep[] = [];
  for (const event of events) {
    if (steps.length === 0) {
      steps.push({
        state: event.fromState,
        label: event.fromState ? lifecycleLabel(event.fromState) : "创建实例",
        // 第一条转变的 from 就是「创建」：实例是那一刻建的，时间用它，别显示成缺失。
        arrivedAt: event.at,
      });
    }
    steps.push({
      state: event.toState,
      label: lifecycleLabel(event.toState),
      arrivedAt: event.at,
    });
  }
  // 相邻同状态（例如某次转变的 from 与上一次的 to 相同以外的重复）只留最后一个。
  return steps.filter(
    (step, index) => index === steps.length - 1 || step.state !== steps[index + 1].state,
  );
}

/** 一项「标签 + 值」；`primary` 用于最该被一眼看到的两个指标（在线率、Agent 在线数）。 */
function Metric({
  label,
  primary = false,
  children,
}: {
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div
        className={
          primary
            ? `${styles.metricValue} ${styles.metricValuePrimary}`
            : styles.metricValue
        }
      >
        {children}
      </div>
    </div>
  );
}
