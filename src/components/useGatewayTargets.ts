import { useEffect, useMemo, useRef, useState } from "react";
import {
  selectGatewayUpgradeTargets,
  toggleGatewayTarget,
  type UpgradeFleetGateway,
} from "./gatewayUpgradeTargets";

export interface GatewayTargetSelection {
  /** 当前选中、已按 gateway_id 排序的目标。 */
  selected: string[];
  /** 机队台数（已接入并上报过、未归档）。 */
  fleetSize: number;
  /** 机队里明确离线的台数。 */
  offlineCount: number;
  toggle: (gatewayId: string) => void;
  /** 回到默认：全选在线（排除明确离线的）。 */
  resetToDefault: () => void;
  clear: () => void;
  /** 是否还停留在默认选择（没手动动过）。 */
  isDefault: boolean;
}

/**
 * 「发布目标」的选择状态（① 升级安装 / ② Agent 包 / ③ 知识库共用）。
 *
 * 默认仍是**全选在线**（与网关侧同一口径：排掉明确离线的，因为它们拉不到计划、会把
 * 灰度阶段卡住），但**允许改**：现场常常只想先发一两台，或者把某台压测机排除在外。
 *
 * 状态用 `override === null` 表示「还没手动动过」，而不是在挂载时把默认值抄进 state ——
 * 机队后来才上报、或者状态视图刷新时，抄进去的那份会过时；`null` 会跟着机队自动更新。
 * 用户一旦动过（勾 / 取消 / 清空），就固定成手选，不再被刷新覆盖。
 */
export function useGatewayTargets(
  gateways: readonly UpgradeFleetGateway[],
  exampleFleet: boolean,
): GatewayTargetSelection {
  const defaults = useMemo(
    () => selectGatewayUpgradeTargets(gateways),
    [gateways],
  );
  const [override, setOverride] = useState<string[] | null>(null);

  // 示例机队 ↔ 真实机队切换时清掉手选：示例里的 gateway_id 在中心并不存在。
  const wasExample = useRef(exampleFleet);
  useEffect(() => {
    if (wasExample.current === exampleFleet) return;
    wasExample.current = exampleFleet;
    setOverride(null);
  }, [exampleFleet]);

  const selected = override ?? defaults.targetIds;

  function toggle(gatewayId: string) {
    setOverride(() => toggleGatewayTarget(selected, gatewayId));
  }

  return {
    selected,
    fleetSize: defaults.fleetSize,
    offlineCount: defaults.offlineCount,
    toggle,
    resetToDefault: () => setOverride(null),
    clear: () => setOverride([]),
    isDefault: override === null,
  };
}
