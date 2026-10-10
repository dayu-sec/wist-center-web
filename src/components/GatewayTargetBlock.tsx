import type { GatewayStatusView } from "../api";
import styles from "./PlanForm.module.css";

/**
 * 「创建升级计划」两个面板（① 升级安装 / ② Agent 包下发）共用的**目标块**。
 *
 * 目标不再手勾（学 gateway-web 的「Agent 升级」，口径见 `gatewayUpgradeTargets`）：机队里排掉
 * 明确离线的，其余全部自动成为目标；这里只**把结果摊开**让人核对 —— 哪些进、哪些被排除、为什么。
 *
 * 机队本身也不是「所有网关记录」：它来自中心的状态视图 = **已接入并上报过**、且未归档的网关
 * （未接入的实例留在实例页的「待接入」组里，不会出现在这里）。
 */
export function GatewayTargetBlock({
  gateways,
  targetIds,
  fleetSize,
  offlineCount,
  exampleFleet,
  exampleVersions,
}: {
  gateways: readonly GatewayStatusView[];
  targetIds: readonly string[];
  fleetSize: number;
  offlineCount: number;
  /** 机队来自内置示例数据（接口不可达 / 未鉴权）。 */
  exampleFleet: boolean;
  /** 版本列表来自内置示例数据。 */
  exampleVersions: boolean;
}) {
  const excluded = gateways.filter((gateway) => gateway.status === "offline");
  const exampleData = exampleFleet || exampleVersions;

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <span className={styles.blockTitle}>
          Gateway 目标（自动确定 {targetIds.length} 台）
        </span>
        <span className={styles.sectionNote}>
          学「Agent 升级」：机队里排掉明确离线的，其余全部自动成为目标，不用逐个勾
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
          机队 <strong>{fleetSize}</strong> 台（<strong>已接入并上报过</strong>
          、未归档的网关；未接入的实例不在此列）
          {offlineCount > 0
            ? `，其中 ${offlineCount} 台明确离线已排除在目标之外`
            : ""}
          。目标按 gateway_id 排序自动切片。
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
            return (
              <span
                key={gateway.gatewayId}
                className={`${styles.gatewayCard} ${
                  offline ? styles.gatewayCardExcluded : ""
                }`}
              >
                <span className={styles.gatewayCardId}>
                  {gateway.gatewayId}
                </span>
                <span className={styles.gatewayCardSub}>
                  {gateway.version}
                  {offline ? " · 离线（排除）" : ""}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {excluded.length > 0 && !exampleData ? (
        <span className={styles.formNote}>
          离线的 {excluded.map((gateway) => gateway.gatewayId).join("、")}{" "}
          被排除：拉不到计划的目标排进金丝雀 / 批次只会把整段卡住（阶段永远不了结）。
          等它们回到在线，再用新的计划覆盖。
        </span>
      ) : null}
    </div>
  );
}
