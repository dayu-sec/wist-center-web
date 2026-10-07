import { useState } from "react";
import { useGatewayAgentsForAll, useGatewayStatusView } from "../hooks";
import { PageShell } from "./ui";
import { UpgradePlanCreatePanel } from "./UpgradePlanCreatePanel";
import { AgentPackagePushPanel } from "./AgentPackagePushPanel";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import { GatewayVersionText } from "./GatewayVersionText";
import styles from "./ReleaseWorkspace.module.css";

type ReleaseFlow = "upgrade" | "agent-package";

const FLOWS: { key: ReleaseFlow; name: string; tagline: string }[] = [
  { key: "upgrade", name: "① 升级安装", tagline: "stack / gops / gx" },
  { key: "agent-package", name: "② Agent 包下发", tagline: "推到网关包管理" },
];

/**
 * 发布：把**中心托管的包**装出去，两种（区别在「谁决定升级」）：
 * ① 升级安装 —— `wist-gateway-stack` / `galaxy-ops` / `galaxy-flow` 推到网关，中心决定、装下去；
 * ② Agent 包下发 —— `wist-agentd` 推到网关的包管理，是否升级由网关决定。
 *
 * 包本身的录入/历史见「包管理」页。
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
      title="制定发布计划"
      summary="把中心托管的安装包装出去：① 宿主组件推下去升级安装；② Agent 包推到网关的包管理（由网关决定升级）。"
    >
      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <h2 className={styles.workspaceTitle}>发布方式</h2>
            <p className={styles.workspaceSubtitle}>
              区别在「谁决定升级」：① 由中心直接推下去安装；② 只把包交给网关，升不升由网关决定。
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
          ) : (
            <AgentPackagePushPanel />
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
