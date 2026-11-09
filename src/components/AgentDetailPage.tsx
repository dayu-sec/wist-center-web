import { Link, useParams } from "react-router-dom";
import {
  useAgentHistories,
  useGatewayAgents,
  useReportGatewayAgents,
} from "../hooks";
import {
  formatBytes,
  formatPercent,
  formatRelativeTime,
  LoadingDots,
  PageShell,
} from "./ui";
import { AgentDataManifestView } from "./AgentDataManifestView";
import { GatewayHealthBadge } from "./GatewayHealthBadge";
import { GatewayHistoryChart } from "./GatewayHistoryChart";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import { agentListPath } from "./agentRoutes";
import styles from "./AgentDetailPage.module.css";

/** 头部折叠前先露几个 IP（`bridge100…` 这类一次能报十几条）。 */
const IP_PREVIEW = 2;

/**
 * 单台 Agent 的详情页。
 *
 * 为什么单独一页而不是卡片内展开：数据清单（采集授权 / 调查数据）在窄卡片里只能限高滚动，
 * 一台机器的授权条目一多就看不全；而且「这台 Agent 到底被授权采了什么」是需要
 * 分享给别人看、刷新还要还在原处的东西 —— 和网关切片的理由一样，用独立路由。
 *
 * 版面取舍：身份与资源挤在**一张头部卡**里（横向排），清单两栏并排、条目用分隔线
 * 而不是层层卡片 —— 详情页要的是密度，卡片才需要描边。
 */
export function AgentDetailPage() {
  const { gatewayId = "", agentId = "" } = useParams();
  const { data: agentsData, isLoading } = useGatewayAgents(gatewayId);
  const agents = agentsData?.data ?? [];
  const agent = agents.find((item) => item.agentId === agentId) ?? null;

  // 历史只查这一台：详情页不需要整支机队的曲线。
  const { data: agentHistoriesData } = useAgentHistories(
    gatewayId,
    agent ? [agent.agentId] : [],
  );
  const history = agent ? agentHistoriesData?.[agent.agentId] : undefined;

  const refreshAgents = useReportGatewayAgents();
  const listPath = agentListPath(gatewayId);

  return (
    <PageShell
      title="Agent 详情"
      summary="运行状态与数据清单都是只读视图；「立即刷新」让网关现在上报一次，不必等 60s 周期。"
    >
      <Link to={listPath} className={styles.backLink}>
        ← 返回 Agent 状态
      </Link>

      {isLoading && !agent ? <LoadingDots /> : null}

      {!isLoading && !agent ? (
        <section className={styles.section}>
          <div className={styles.card}>
            <div className={styles.emptyTitle}>
              这台网关下没有 Agent <code>{agentId}</code>。
            </div>
            {/* 换了机器 / Agent 已下线时旧链接会留着 —— 给出下一步，而不是一片空白。 */}
            <div className={styles.emptyHint}>
              可能是 Agent 已下线或主机重装换了 agentId。回上一页看当前在册的 Agent。
            </div>
          </div>
        </section>
      ) : null}

      {agent ? (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <div className={styles.identity}>
                <div className={styles.identityMain}>
                  <span className={styles.agentId} title={agent.agentId}>
                    {agent.agentId}
                  </span>
                  <GatewayOnlineStatusBadge value={agent.status} />
                  <GatewayHealthBadge value={agent.health} />
                </div>
                {/* 60s 周期上报是兜底；这里让中心可以「现在就要一份」。 */}
                <button
                  type="button"
                  className={styles.refresh}
                  disabled={refreshAgents.isPending}
                  onClick={() => refreshAgents.mutate(gatewayId)}
                >
                  {refreshAgents.isPending ? "下发中…" : "立即刷新"}
                </button>
              </div>
              {refreshAgents.error ? (
                <div className={styles.refreshError}>
                  下发刷新失败：{String(refreshAgents.error)}
                </div>
              ) : null}
              {refreshAgents.isSuccess ? (
                <div className={styles.refreshHint}>
                  已下发刷新（{refreshAgents.data?.command_id ?? "-"}
                  ），几秒内更新。
                </div>
              ) : null}

              <div className={styles.facts}>
                <Fact label="主机名" value={agent.hostname ?? "—"} />
                <Fact label="版本" value={agent.version} mono />
                <Fact label="instance" value={agent.instanceId} mono />
                <Fact
                  label="最后上报"
                  value={formatRelativeTime(agent.lastSeenAt)}
                />
                <IpList addresses={agent.ipAddresses} />
              </div>

              <div className={styles.metrics}>
                <span>内存 {formatBytes(agent.memoryBytes)}</span>
                <span>CPU {formatPercent(agent.cpuPercent)}</span>
                <span>时延 {agent.adminLatencyMs ?? "—"}ms</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>数据清单</div>
              <div className={styles.sectionMeta}>
                {agent.dataManifest
                  ? `采集于 ${formatRelativeTime(agent.dataManifest.collectedAt)}`
                  : "未上报"}
              </div>
            </div>
            <div className={styles.card}>
              {/* 宽屏不限高：这一页就是为了把清单看全。 */}
              <AgentDataManifestView
                manifest={agent.dataManifest}
                variant="full"
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>最近 1 小时</div>
            </div>
            <div className={styles.card}>
              <GatewayHistoryChart
                history={history?.data}
                source={history?.source}
                title={`${agent.agentId} 最近 1 小时`}
              />
            </div>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span
        className={mono ? styles.factValueMono : styles.factValue}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * IP 列表：先露前两条，其余折进 `<details>`。
 * 一台 Mac 常常同时报 `bridge100…107` / `utun100` / `en0` 十几条，全铺出来会吃掉半屏。
 */
function IpList({ addresses }: { addresses: string[] }) {
  if (addresses.length === 0) {
    return (
      <div className={styles.fact}>
        <span className={styles.factLabel}>IP</span>
        <span className={styles.factValue}>—</span>
      </div>
    );
  }
  const head = addresses.slice(0, IP_PREVIEW);
  const rest = addresses.slice(IP_PREVIEW);
  if (rest.length === 0) {
    return (
      <div className={styles.fact}>
        <span className={styles.factLabel}>IP</span>
        <code className={styles.factValueMono}>{head.join(" · ")}</code>
      </div>
    );
  }
  return (
    <details className={styles.ips}>
      <summary className={styles.ipsSummary}>
        <span className={styles.factLabel}>IP</span>
        <code className={styles.factValueMono}>{head.join(" · ")}</code>
        <span className={styles.ipsMore}>还有 {rest.length} 个</span>
      </summary>
      <ul className={styles.ipsList}>
        {rest.map((address) => (
          <li key={address}>
            <code>{address}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}
