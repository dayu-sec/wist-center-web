import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, type GatewayInstance, type GatewayStatusView } from "../api";
import {
  useGatewayInstances,
  useGatewayStatusView,
  useSetGatewayArchived,
} from "../hooks";
import {
  Badge,
  ErrorBanner,
  formatRelativeTime,
  lifecycleLabel,
  lifecycleTone,
  LoadingDots,
} from "./ui";
import { ExampleDataTag } from "./GatewayStatusOverviewMetrics";
import { GatewayOnlineStatusBadge } from "./GatewayOnlineStatusBadge";
import styles from "./GatewayInstanceList.module.css";

/**
 * 一行实例 + 它的**实时**网关状态。`runtime` 是三态：
 *
 * - `undefined`：拿不到可信的实时状态（status 视图本身是示例数据）—— 退回只展示生命周期；
 * - `null`：status 视图里没有这台网关（从未上报过）；
 * - 有值：以网关上报的 `status`（online / offline）为准。
 *
 * 生命周期（`lifecycle_state`）说明「接入流程走到哪一步」，是**历史事实**；
 * 网关是否在线要看上报，两者会不一致 —— 已接入的网关同样可能掉线。
 */
interface InstanceRow {
  instance: GatewayInstance;
  runtime: GatewayStatusView | null | undefined;
}

/** 实时状态徽标：在线 / 离线 / 无上报。 */
function RuntimeBadge({ value }: { value: GatewayStatusView | null }) {
  if (value === null) return <Badge tone="gray">无上报</Badge>;
  return <GatewayOnlineStatusBadge value={value.status} />;
}

/** 归档失败的一句话原因（在线网关中心会拒，说清「怎么办」比说「失败了」有用）。 */
function archiveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "这台网关还在线（HTTP 409）：要把它收起来，先在网关上停掉（停掉后上报会转为离线），再归档。";
    if (error.status === 404)
      return "这台网关已不在中心（HTTP 404）：刷新页面看看。";
    return `归档失败（HTTP ${error.status}），请检查中心日志。`;
  }
  return "归档失败：响应不符合当前契约，请检查中心与前端版本。";
}

/** 按接入阶段展示实例，避免 Center 接入材料与运行监控入口混在同一序列中。 */
function InstanceGroup({
  id,
  title,
  description,
  rows,
  emptyText,
  archivePending,
  archivable = false,
  onArchive,
}: {
  id: string;
  title: string;
  description: string;
  rows: InstanceRow[];
  emptyText: string;
  archivePending: boolean;
  /** 这一组是否给「归档」入口（只有「已运行实例」给：待接入还没跑起来，先别收）。 */
  archivable?: boolean;
  /** 归档 / 取消归档（方向由该行是否已归档决定）。 */
  onArchive?: (row: InstanceRow) => void;
}) {
  return (
    <section className={styles.group} aria-labelledby={id}>
      <header className={styles.groupHeader}>
        <div>
          <h3 id={id} className={styles.groupTitle}>
            {title}
          </h3>
          <p className={styles.groupDescription}>{description}</p>
        </div>
        <span className={styles.groupCount}>{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <div className={styles.empty}>{emptyText}</div>
      ) : (
        <div className={styles.list}>
          {rows.map((row) => {
            const { instance, runtime } = row;
            const running = instance.lifecycleState === "Running";
            const archived = Boolean(instance.archivedAt);
            // 已运行但没在上报（离线 / 从未上报）时，把最后上报时间摆出来便于定位。
            const lostContact =
              running &&
              !archived &&
              runtime !== undefined &&
              (runtime === null || runtime.status !== "online");
            // 归档只对**离线**的已运行实例开放：在线的不该被藏起来（中心同样会拒）。
            // 实时状态拿不到（示例数据）时不给这个入口 —— 宁可少一个按钮，也不给一个必然 409 的。
            const offline =
              runtime !== undefined &&
              (runtime === null || runtime.status !== "online");
            const canArchive =
              archivable && running && offline && !archived;
            return (
              <div key={instance.gatewayId} className={styles.itemWrap}>
                <Link
                  to={
                    running
                      ? `/gateways/${encodeURIComponent(instance.gatewayId)}`
                      : `/instance/${encodeURIComponent(instance.gatewayId)}`
                  }
                  className={styles.item}
                  data-state={instance.lifecycleState}
                  data-archived={archived ? "true" : undefined}
                  data-runtime={
                    running
                      ? runtime === undefined
                        ? "unknown"
                        : (runtime?.status ?? "never")
                      : "n/a"
                  }
                >
                  <div className={styles.itemMain}>
                    <div className={styles.gatewayId}>{instance.gatewayId}</div>
                    <div className={styles.instanceId}>
                      {instance.instanceId || "未上报实例"}
                    </div>
                    {lostContact ? (
                      <div className={styles.lastSeen}>
                        {runtime
                          ? `最后上报 ${formatRelativeTime(runtime.lastSeenAt)}`
                          : "网关尚未上报过状态"}
                      </div>
                    ) : null}
                    {archived ? (
                      <div className={styles.archivedHint}>
                        已归档
                        {instance.archivedAt
                          ? ` · ${formatRelativeTime(instance.archivedAt)}`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.itemAside}>
                    {archived ? (
                      <Badge tone="gray">已归档</Badge>
                    ) : running && runtime !== undefined ? (
                      <RuntimeBadge value={runtime} />
                    ) : (
                      <Badge tone={lifecycleTone(instance.lifecycleState)}>
                        {lifecycleLabel(instance.lifecycleState)}
                      </Badge>
                    )}
                    <span className={styles.actionLabel}>
                      {running ? "运行详情 →" : "接入材料 →"}
                    </span>
                  </div>
                </Link>
                {archivable && (canArchive || archived) ? (
                  <button
                    type="button"
                    className={styles.archiveButton}
                    disabled={archivePending}
                    onClick={() => onArchive?.(row)}
                    title={
                      archived
                        ? "取消归档：让它回到默认视图"
                        : "归档这台离线的网关：默认视图不再显示它（状态与历史保留，可随时恢复）"
                    }
                  >
                    {archived ? "取消归档" : "归档"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 网关实例总览：加载一次实例数据，并将接入中与运行中实例分区呈现。 */
export function GatewayInstanceList() {
  // 归档默认隐藏（中心侧过滤）；勾上这个开关才把它们取回来 —— 要恢复时从这里进去。
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, isLoading } = useGatewayInstances(showArchived);
  const { data: statusView } = useGatewayStatusView(showArchived);
  const archive = useSetGatewayArchived();
  const instances = data?.data ?? [];

  // 只有 real 的 status 视图才可信：示例状态一律不当作在线/离线，否则又会显示假状态。
  const runtimeByGateway =
    statusView?.source === "real"
      ? new Map(statusView.data.map((status) => [status.gatewayId, status]))
      : null;
  const runtimeOf = (
    instance: GatewayInstance,
  ): GatewayStatusView | null | undefined =>
    runtimeByGateway === null
      ? undefined
      : (runtimeByGateway.get(instance.gatewayId) ?? null);

  const toRow = (instance: GatewayInstance): InstanceRow => ({
    instance,
    runtime: runtimeOf(instance),
  });
  const onboardingRows = instances
    .filter((instance) => instance.lifecycleState !== "Running")
    .map(toRow);
  const runningRows = instances
    .filter((instance) => instance.lifecycleState === "Running")
    .map(toRow);
  const archivedCount = instances.filter((instance) =>
    Boolean(instance.archivedAt),
  ).length;
  // 已接入却在掉线（或从未上报）的数量：实时状态不可信时不统计，避免误导；**已归档的不算** ——
  // 那些是被有意收起来的，另有「已归档」计数。
  const offlineCount =
    runtimeByGateway === null
      ? 0
      : runningRows.filter(
          ({ instance, runtime }) =>
            !instance.archivedAt && (!runtime || runtime.status !== "online"),
        ).length;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>实例总览</h2>
          <div className={styles.subtitle}>
            按接入阶段分区展示，快速定位待部署实例和已运行网关。
          </div>
        </div>
        <div className={styles.summary} role="group" aria-label="实例数量统计">
          <span className={styles.summaryItem}>
            <strong>{onboardingRows.length}</strong> 待接入
          </span>
          <span className={styles.summaryItem}>
            <strong>{runningRows.length}</strong> 已运行
          </span>
          {offlineCount > 0 ? (
            <span className={`${styles.summaryItem} ${styles.summaryItemAlert}`}>
              <strong>{offlineCount}</strong> 离线
            </span>
          ) : null}
          {archivedCount > 0 ? (
            <span className={styles.summaryItem}>
              <strong>{archivedCount}</strong> 已归档
            </span>
          ) : null}
          <label className={styles.archivedToggle}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            显示已归档
          </label>
        </div>
      </div>

      <ExampleDataTag source={data?.source} />

      {archive.error ? (
        <div className={styles.feedback}>
          <ErrorBanner>{archiveErrorMessage(archive.error)}</ErrorBanner>
        </div>
      ) : null}

      {isLoading && instances.length === 0 ? (
        <div className={styles.feedback}>
          <LoadingDots />
        </div>
      ) : null}
      {error ? (
        <div className={styles.feedback}>
          <ErrorBanner>实例列表加载失败：{String(error)}</ErrorBanner>
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className={styles.groups}>
          <InstanceGroup
            id="gateway-onboarding-title"
            title="待接入实例"
            description="尚未完成首次上线，需要继续部署并在 Gateway 管理台完成初始化。"
            rows={onboardingRows}
            emptyText="当前没有待接入实例。"
            archivePending={archive.isPending}
          />
          <InstanceGroup
            id="gateway-running-title"
            title="已运行实例"
            description="已完成接入；徽标是网关实时上报的在线状态，离线时点进去看运行详情排查，确认不再用了可以归档。"
            rows={runningRows}
            emptyText="当前没有已运行实例。"
            archivePending={archive.isPending}
            onArchive={({ instance }) =>
              archive.mutate({
                gatewayId: instance.gatewayId,
                archived: !instance.archivedAt,
              })
            }
            archivable
          />
        </div>
      ) : null}
    </section>
  );
}
