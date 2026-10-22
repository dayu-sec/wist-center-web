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

type Flow = { key: ReleaseFlow; name: string; tagline: string };

/**
 * 发布方式分两组，避免把「装运行时」和「推内容 / 规则」混在一排：
 * - 运行时：① 宿主组件升级安装、② Agent 包下发；
 * - 内容与配置：③ 知识库、④ wparse-rules、⑤ wparse-infra。
 */
const FLOW_GROUPS: { key: string; label: string; flows: Flow[] }[] = [
  {
    key: "runtime",
    label: "运行时",
    flows: [
      {
        key: "upgrade",
        name: "① 升级安装",
        tagline: "stack / gops / gx / gwlinkd",
      },
      { key: "agent-package", name: "② Agent 包下发", tagline: "推到网关包管理" },
    ],
  },
  {
    key: "content",
    label: "内容与配置",
    flows: [
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
    ],
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
      summary="把中心托管的包 / 规则发出去，分两组：运行时（① 宿主组件升级安装、② Agent 包推到包管理）；内容与配置（③ 知识库、④/⑤ 选 wparse-rules / wparse-infra 的 tag 重载目标网关）。四种方式都先建计划，到「发布执行」页批准后才真正下发。"
    >
      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <h2 className={styles.workspaceTitle}>发布方式</h2>
            <p className={styles.workspaceSubtitle}>
              运行时（①②）决定「装什么、怎么升」：① 由中心直接推下去安装；② 只把包交给网关，
              升不升由网关决定。内容与配置（③④⑤）决定「推什么内容 / 规则」：③ 知识库内容是否激活
              由计划里的开关决定；④/⑤ 选中 tag 后同样先落一份计划，批准后由中心经 wparse-proxy
              命令队列投给目标网关（网关只做 relay）。
            </p>
          </div>
        </header>
        <div className={styles.tabGroups}>
          {FLOW_GROUPS.map((group) => (
            <div className={styles.tabGroup} key={group.key}>
              <span className={styles.groupLabel}>{group.label}</span>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label={`${group.label}发布方式`}
              >
                {group.flows.map((flow) => (
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
            </div>
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
              subtitle="规则 / 模型仓库：创建计划，批准后重载目标网关的 models 分组。"
            />
          ) : (
            <WparseReleasePanel
              repoName="wparse-infra"
              title="wparse-infra 发布"
              subtitle="配置 / infra 仓库：创建计划，批准后重载目标网关的 infra 分组。"
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
