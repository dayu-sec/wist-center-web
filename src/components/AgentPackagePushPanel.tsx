import { AGENT_PACKAGE_PUSH_ACTION, jsonUpgradeSpec } from "../api";
import { PackagePushPanel } from "./PackagePushPanel";
import { AGENT_PACKAGE_COMPONENTS } from "./releaseComponents";

/** ② 只发这一个组件：把 `wist-agentd` 包交给网关包管理，**升不升由网关决定**。 */
const COMPONENT = AGENT_PACKAGE_COMPONENTS[0];

/**
 * ② Agent 包下发：把**已托管**的 `wist-agentd` 包推送到选定网关的**包管理**。
 *
 * 与 ① 的区别在「谁决定升级」：① 由中心推下去安装；② 只把包交给网关，**升不升由网关决定**
 * （见设计 `edge/agent-package-push-to-gateways.md`）。计划本体仍是通用的灰度发布计划
 * （`action = push-agent-package`），所以**批准 / 推进 / 逐台进度**复用「发布执行」页。
 */
export function AgentPackagePushPanel() {
  return (
    <PackagePushPanel
      action={AGENT_PACKAGE_PUSH_ACTION}
      component={COMPONENT}
      title="创建 Agent 包下发计划"
      subtitle="选一个已托管的 wist-agentd 版本；网关目标自动确定（排除明确离线的）；中心把包交给网关包管理，是否升级由网关决定。"
      versionLabel="Agent 包版本（wist-agentd）"
      buildSpec={(component, version) =>
        jsonUpgradeSpec([{ component, targetVersion: version }])
      }
    />
  );
}
