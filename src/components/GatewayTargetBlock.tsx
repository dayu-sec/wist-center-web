import type { GatewayStatusView } from "../api";
import styles from "./PlanForm.module.css";

/**
 * 「创建发布计划」三个面板（① 升级安装 / ② Agent 包 / ③ 知识库）共用的**目标选择块**。
 *
 * 默认全选在线（排掉明确离线的 —— 它们拉不到计划，排进金丝雀 / 批次只会把整段卡住），
 * 但**可以逐个改**：现场常常只想先发一两台，或把压测机、待下线机器排除在外。
 * 选中的目标就是这次任务的范围，灰度阶段在**这个范围**内按阶梯切分。
 *
 * 机队本身来自中心的状态视图 = **已接入并上报过**、且未归档的网关（未接入的实例留在
 * 实例页的「待接入」组里，不会出现在这里）。
 */
export function GatewayTargetBlock({
  gateways,
  targetIds,
  fleetSize,
  offlineCount,
  exampleFleet,
  exampleVersions,
  onToggle,
  onResetToDefault,
  onClear,
}: {
  gateways: readonly GatewayStatusView[];
  /** 当前选中的目标（已排序）。 */
  targetIds: readonly string[];
  fleetSize: number;
  offlineCount: number;
  /** 机队来自内置示例数据（接口不可达 / 未鉴权）。 */
  exampleFleet: boolean;
  /** 版本列表来自内置示例数据。 */
  exampleVersions: boolean;
  onToggle: (gatewayId: string) => void;
  onResetToDefault: () => void;
  onClear: () => void;
}) {
  const selected = new Set(targetIds);
  const excluded = gateways.filter((gateway) => gateway.status === "offline");
  const exampleData = exampleFleet || exampleVersions;
  // 手选了离线网关：允许，但把后果说清楚（阶段可能永远不了结）。
  const offlineSelected = excluded.filter((gateway) =>
    selected.has(gateway.gatewayId),
  );

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span className={styles.blockTitle}>
          Gateway 目标（已选 {targetIds.length} / {fleetSize} 台）
        </span>
        <span className={styles.targetActions}>
          <button
            type="button"
            className={styles.targetAction}
            onClick={onResetToDefault}
            disabled={exampleFleet}
          >
            全选在线
          </button>
          <button
            type="button"
            className={styles.targetAction}
            onClick={onClear}
            disabled={exampleFleet || targetIds.length === 0}
          >
            清空
          </button>
        </span>
      </div>

      {exampleData ? (
        <div className={styles.exampleBanner} role="alert">
          <strong>当前是内置示例数据，不是你的真实机队 / 版本</strong>
          {exampleFleet ? "（网关列表）" : ""}
          {exampleVersions ? "（已发布版本）" : ""}
          ：后端管理接口未就绪或未鉴权（左侧填 Admin Token；中心不可达也会这样）。示例里的
          gateway_id 与版本号在中心并不存在，建出来的计划要么被拒、要么永远解析不出制品 ——
          所以这里先禁掉了提交。
        </div>
      ) : (
        <span className={styles.formNote}>
          默认全选在线（已接入并上报过、未归档的网关；未接入的实例不在此列）
          {offlineCount > 0
            ? `，其中 ${offlineCount} 台明确离线默认不选`
            : ""}
          。点卡片可逐台取消 / 加回 —— **选中的这几台就是本次任务的范围**，灰度阶段只在其中切分。
        </span>
      )}

      {gateways.length === 0 ? (
        <div className={styles.empty}>
          {exampleData
            ? "（示例机队里也没有可用网关。）"
            : "暂无已接入的网关：实例页里先完成接入，网关首次上报后才会出现在这里。"}
        </div>
      ) : (
        <div className={styles.gatewayGrid}>
          {gateways.map((gateway) => {
            const offline = gateway.status === "offline";
            const checked = selected.has(gateway.gatewayId);
            return (
              <button
                key={gateway.gatewayId}
                type="button"
                aria-pressed={checked}
                disabled={exampleFleet}
                onClick={() => onToggle(gateway.gatewayId)}
                className={[
                  styles.gatewayCard,
                  checked ? styles.gatewayCardSelected : "",
                  !checked && offline ? styles.gatewayCardExcluded : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.gatewayCardId}>
                  {checked ? "✓ " : ""}
                  {gateway.gatewayId}
                </span>
                <span className={styles.gatewayCardSub}>
                  {gateway.version}
                  {offline ? (checked ? " · 离线（已选）" : " · 离线") : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {offlineSelected.length > 0 && !exampleData ? (
        <span className={styles.formWarn}>
          已选中的离线网关：{offlineSelected
            .map((gateway) => gateway.gatewayId)
            .join("、")}
          —— 它们拉不到计划，排进金丝雀 / 批次会把该段卡住（阶段永远不了结）。确认已恢复再推进。
        </span>
      ) : null}
    </div>
  );
}
