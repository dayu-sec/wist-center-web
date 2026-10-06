import { SectionCard } from "./ui";
import styles from "./ReleaseWorkspace.module.css";

/**
 * ② Agent 包下发：把 `wist-agentd` 推到选定网关的**包管理**，之后是否升级 Agent 由网关自行决定
 * （区别于 ① 由中心直接推下去升级安装）。
 *
 * **待接通**：中心目前没有「调网关管理面」的写通路。落地方式是把 agentd 制品推送到网关的
 * `POST /api/v1/admin/agent/install-package`，执行者是 `wist-gwlinkd`（与 ① 同一执行者）。
 * 本轮先把 ①（wist-gateway-stack / galaxy-ops / galaxy-flow）跑通。
 */
export function AgentPackagePushPanel() {
  return (
    <SectionCard
      title="② Agent 包下发"
      subtitle="把 wist-agentd 推送到选定网关的包管理；是否升级 Agent 由网关自行决定。"
    >
      <div className={styles.pending}>
        这条链路**尚未接通**。计划：中心把 `wist-agentd` 制品推送到选定网关的管理面
        （<code>POST /api/v1/admin/agent/install-package</code>），执行者为{" "}
        <code>wist-gwlinkd</code>；网关拿到包后自行决定何时/是否升级 Agent。
        <br />
        本轮先跑通「① 升级安装」（<code>wist-gateway-stack</code> /{" "}
        <code>galaxy-ops</code> / <code>galaxy-flow</code>）。
      </div>
    </SectionCard>
  );
}
