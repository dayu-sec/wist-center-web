import { useState } from "react";
import { useGatewayAgentsForAll, useGatewayStatusView } from "../hooks";
import { PageShell } from "./ui";
import { UpgradePlanCreatePanel } from "./UpgradePlanCreatePanel";
import { AgentPackagePushPanel } from "./AgentPackagePushPanel";
import { KnowledgePackagePushPanel } from "./KnowledgePackagePushPanel";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import { GatewayVersionText } from "./GatewayVersionText";
import { WparseReleasePanel } from "./WparseReleasePanel";
import styles from "./ReleaseWorkspace.module.css";

type ReleaseFlow =
  | "upgrade"
  | "agent-package"
  | "knowledge"
  | "wparse-rules"
  | "wparse-infra";

const FLOWS: { key: ReleaseFlow; name: string; tagline: string }[] = [
  {
    key: "upgrade",
    name: "① 升级安装",
    tagline: "stack / gops / gx / gwlinkd",
  },
  { key: "agent-package", name: "② Agent 包下发", tagline: "推到网关包管理" },
  { key: "knowledge", name: "③ 知识库下发", tagline: "推到网关知识库管理" },
  {
    key: "wparse-rules",
    name: "④ wparse-rules",
    tagline: "规则 / 模型 tag 发布",
  },
  {
    key: "wparse-infra",
    name: "⑤ wparse-infra",
    tagline: "配置 / infra tag 发布",
  },
];

/**
 * 发布：把**中心托管的包**装出去，两种（区别在「谁决定升级」）：
 * ① 升级安装 —— `wist-gateway-stack` / `galaxy-ops` / `galaxy-flow` / `wist-gwlinkd` 推到网关，
 *    中心决定、装下去（gwlinkd 自己覆盖二进制，重启后核对版本回执）；
 * ② Agent 包下发 —— `wist-agentd` 推到网关的包管理，是否升级由网关决定。
 *
 * 包本身的录入/历史见「安装包管理」页。
 */
export function ReleasePage() {
  const [activeFlow, setActiveFlow] = useState<ReleaseFlow>("upgrade");
  const { data: statusData } = useGatewayStatusView();
  const gateways = statusData?.data ?? [];
  const gatewayIds = gateways.map((gateway) => gateway.gatewayId);
  const { data: agentsData } = useGatewayAgentsForAll(gatewayIds);
  const agents = agentsData ?? [];

  return (
    <PageShell
      title="发布计划"
      summary="把中心托管的包 / 规则发出去：① 宿主组件升级安装；② Agent 包推到包管理；③ 知识库推到网关知识库；④/⑤ 选 wparse-rules / wparse-infra 的 tag 直接重载目标网关。"
    >
      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <h2 className={styles.workspaceTitle}>发布方式</h2>
            <p className={styles.workspaceSubtitle}>
              ①②③ 的区别在「谁决定升级 / 生效」：① 由中心直接推下去安装；② 只把包交给网关，
              升不升由网关决定；③ 只把知识库内容交给网关，是否激活由计划里的开关决定。
              ④/⑤ 是按 tag 的规则发布：选中 tag 后经 wparse-proxy 命令队列直达目标网关。
            </p>
          </div>
        </header>
        <div className={styles.tabs} role="tablist" aria-label="发布方式">
          {FLOWS.map((flow) => (
            <button
              key={flow.key}
              type="button"
              role="tab"
              id={`release-tab-${flow.key}`}
              aria-selected={flow.key === activeFlow}
              aria-controls="release-panel"
              className={
                flow.key === activeFlow
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              onClick={() => setActiveFlow(flow.key)}
            >
              <strong>{flow.name}</strong>
              <span>{flow.tagline}</span>
            </button>
          ))}
        </div>
        <div
          id="release-panel"
          role="tabpanel"
          aria-labelledby={`release-tab-${activeFlow}`}
          className={styles.tabPanel}
        >
          {activeFlow === "upgrade" ? (
            <UpgradePlanCreatePanel />
          ) : activeFlow === "agent-package" ? (
            <AgentPackagePushPanel />
          ) : activeFlow === "knowledge" ? (
            <KnowledgePackagePushPanel />
          ) : activeFlow === "wparse-rules" ? (
            <WparseReleasePanel
              repoName="wparse-rules"
              title="wparse-rules 发布"
              subtitle="规则 / 模型仓库：选中 tag 后重载目标网关的 models 分组。"
            />
          ) : (
            <WparseReleasePanel
              repoName="wparse-infra"
              title="wparse-infra 发布"
              subtitle="配置 / infra 仓库：选中 tag 后重载目标网关的 infra 分组。"
            />
          )}
        </div>
      </section>

      <section className={styles.inventorySection}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>已部署版本</h2>
            <p className={styles.sectionSubtitle}>
              这些版本来自当前在线状态上报，用于评估发布/升级范围。
            </p>
          </div>
        </header>
        <div className={styles.inventoryGrid}>
          <section className={styles.inventoryCard}>
            <h3 className={styles.inventoryTitle}>Gateway</h3>
            {gateways.length === 0 ? (
              <div className={styles.empty}>暂无网关。</div>
            ) : (
              <div className={styles.table}>
                {gateways.map((gateway) => (
                  <div key={gateway.gatewayId} className={styles.row}>
                    <span className={styles.rowMain}>{gateway.gatewayId}</span>
                    <span className={styles.rowVersion}>
                      <GatewayVersionText value={gateway.version} />
                    </span>
                    <GatewayOnlineStatusBadge value={gateway.status} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.inventoryCard}>
            <h3 className={styles.inventoryTitle}>Agent</h3>
            {agents.length === 0 ? (
              <div className={styles.empty}>暂无 Agent。</div>
            ) : (
              <div className={styles.table}>
                {agents.map((agent) => (
                  <div key={agent.agentId} className={styles.row}>
                    <span className={styles.rowMain}>
                      {agent.agentId}
                      <span className={styles.rowSub}>{agent.gatewayId}</span>
                    </span>
                    <span className={styles.rowVersion}>
                      <GatewayVersionText value={agent.version} />
                    </span>
                    <GatewayOnlineStatusBadge value={agent.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </PageShell>
  );
}
