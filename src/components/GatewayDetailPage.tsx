import { Link, useParams } from "react-router-dom";
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
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>状态</div>
                <GatewayOnlineStatusBadge value={gateway.status} />
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>健康</div>
                <GatewayHealthBadge value={gateway.health} />
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>在线率（1h）</div>
                <div className={styles.metricValue}>{uptimeText}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>内存</div>
                <div>{formatBytes(gateway.memoryBytes)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>CPU</div>
                <div>{formatPercent(gateway.cpuPercent)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>版本</div>
                <GatewayVersionText value={gateway.version} />
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>最后上报</div>
                <div>{formatRelativeTime(gateway.lastSeenAt)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>运行时长</div>
                <div>{formatDuration(gateway.uptimeSeconds)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Agent 在线 / 离线</div>
                <div>
                  {gateway.onlineAgents ?? "—"} / {gateway.offlineAgents ?? "—"}（共
                  {" "}
                  {gateway.agentCount ?? "—"}）
                </div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>存储</div>
                <div>{formatBytes(gateway.storeBytes)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>数据面接收（累计）</div>
                <div>
                  收 {gateway.ingestAcceptedTotal ?? "—"} / 拒{" "}
                  {gateway.ingestRejectedTotal ?? "—"}
                </div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>主机内存</div>
                <div>{formatBytes(gateway.memoryTotalBytes)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>磁盘</div>
                <div>{formatPercent(gateway.diskUsagePercent)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>负载（1m）</div>
                <div>{gateway.load1m === null ? "—" : gateway.load1m.toFixed(2)}</div>
              </div>
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

      {/*
        这台页面只有**已上报**的网关才进得来（状态接口对「从未上报」回 404，`gateway` 就不会有值），
        也就是**已经接入成功**的网关 —— 所以这里不再铺「安装代码 / 接入券」：那两样是给
        **还没接入**的机器（或重装）用的。要看/要重装，去接入材料页（那边打开会轮换接入券）。
      */}
      {gateway ? (
        <section className={styles.section}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.headerRow}>
                <span className={styles.sectionTitle}>已接入，不需要安装材料</span>
              </div>
              <p className={styles.cardNote}>
                这台网关已完成接入并在上报（上面的状态就是它自己报的）。脚本安装命令与一次性接入券
                只在<strong>重新安装这台机器</strong>时才用得到。
              </p>
              <Link
                className={styles.backLink}
                to={`/instance/${encodeURIComponent(gateway.gatewayId)}`}
              >
                接入材料（打开会轮换接入券，旧券立即作废）<span aria-hidden="true"> →</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>生命周期过程</div>
          <span className={styles.sectionMeta}>{lifecycle.length} 次转变</span>
        </div>
        {lifecycle.length === 0 ? (
          <div className={styles.empty}>尚无生命周期记录。</div>
        ) : (
          <div className={styles.timeline}>
            {lifecycle.map((event, index) => (
              <div key={index} className={styles.timelineItem}>
                <span className={styles.timelineDot} aria-hidden="true" />
                <div className={styles.timelineBody}>
                  <div className={styles.timelineText}>
                    {event.fromState
                      ? lifecycleLabel(event.fromState)
                      : "创建实例"}
                    {" → "}
                    {lifecycleLabel(event.toState)}
                  </div>
                  <div className={styles.timelineTime}>
                    {formatRelativeTime(event.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
