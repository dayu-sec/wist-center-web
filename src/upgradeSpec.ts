/**
 * 升级计划的 `spec` 口径（纯函数，不引 React / 不碰网络）。
 *
 * 中心与网关两端都按 `{"targets":[{"component","target_version"}]}` 解析；这里与
 * `wist-center-web/src/api/admin.ts` 原先的实现**同一份**，抽出来是为了让
 * 「建计划 / 手动升级」与契约测试共用，避免两处漂移。
 */
export interface UpgradeTarget {
  component: string;
  targetVersion: string;
}

export function jsonUpgradeSpec(targets: UpgradeTarget[]): string {
  return JSON.stringify({
    targets: targets.map((target) => ({
      component: target.component,
      // 版本**可省**（留空就不写）：升级器回落用「包内自报的版本」
      // —— 与网关侧 `jsonUpgradeSpec` 同一取舍。
      ...(target.targetVersion.trim()
        ? { target_version: target.targetVersion.trim() }
        : {}),
    })),
  });
}
