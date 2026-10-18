import { KNOWLEDGE_PACKAGE_PUSH_ACTION, jsonKnowledgePushSpec } from "../api";
import { PackagePushPanel } from "./PackagePushPanel";
import { KNOWLEDGE_PACKAGE_COMPONENTS } from "./releaseComponents";

/** 只发这一个组件：中心托管的知识库内容包。 */
const COMPONENT = KNOWLEDGE_PACKAGE_COMPONENTS[0];

/**
 * 知识库包下发：把**已托管**的 `wist-knowledge` 包交给选定网关的知识库管理。
 *
 * 与 Agent 包下发的差别：知识库是**内容**，不重建网关、不涉及升级；`activate` 决定录入后
 * 是否立刻切生效指针（缺省不激活 —— 录入 ≠ 生效）。包由 gwlinkd 取（它持中心信任）并落到
 * 网关投放目录（含 `.sig` 旁文件），网关只负责校验与托管。
 *
 * 计划本体仍是通用灰度发布计划（`action = push-knowledge-package`），批准 / 推进 / 逐台进度
 * 复用「发布执行」页。见设计 `edge/knowledge-package-push-to-gateways.md`。
 */
export function KnowledgePackagePushPanel() {
  return (
    <PackagePushPanel
      action={KNOWLEDGE_PACKAGE_PUSH_ACTION}
      component={COMPONENT}
      title="创建知识库下发计划"
      subtitle="选一个已托管的知识库版本；中心把包交给网关的知识库管理（可勾选录入后立即激活），目录/采集面的变更从下一轮发现起生效。"
      versionLabel="知识库版本（wist-knowledge）"
      activateOption
      buildSpec={(component, version, activate) =>
        jsonKnowledgePushSpec([{ component, targetVersion: version }], activate)
      }
    />
  );
}
