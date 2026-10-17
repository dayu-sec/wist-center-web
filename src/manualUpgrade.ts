import type { GatewayUpgradeScriptCommand } from "./api/admin";
import {
  MANUAL_GATEWAY_UPGRADE_COMPONENTS,
  normalizeReleaseVersion,
} from "./components/releaseComponents";

export interface ManualGatewayUpgradeInput {
  gatewayId: string;
  component: string;
  /** 版本 / 命名：可带 `v` 前缀；为空则拒绝。 */
  version: string;
}

/**
 * 校验并归一手动升级脚本请求。
 *
 * 只做**命名归一 + 前置校验**（组件在可选清单里、版本非空、去 `v` 前缀）；
 * 真正的「这个版本有没有发布 / 能不能下载」由中心按发布记录裁决 —— 页面不猜。
 */
export function buildUpgradeScriptRequest(
  input: ManualGatewayUpgradeInput,
): GatewayUpgradeScriptCommand {
  const gatewayId = input.gatewayId.trim();
  const component = canonicalComponent(input.component.trim());
  const version = normalizeReleaseVersion(input.version);
  if (!gatewayId) throw new Error("gatewayId 不能为空");
  if (!component) throw new Error("组件不能为空");
  if (
    !(MANUAL_GATEWAY_UPGRADE_COMPONENTS as readonly string[]).includes(
      component,
    )
  ) {
    throw new Error(`不支持的升级组件：${input.component}`);
  }
  if (!version) throw new Error("版本不能为空（需要填发布版本 / 命名）");
  return { gatewayId, component, version };
}

/** 用户常用简称 → 中心组件名（与中心 `/upgrade-script` 端点同一套别名）。 */
function canonicalComponent(component: string): string {
  switch (component) {
    case "gwlink":
      return "wist-gwlinkd";
    case "gateway-stack":
      return "wist-gateway-stack";
    default:
      return component;
  }
}
