import type { GatewayListView } from "../api";
import { ExampleTag, MetricCard } from "./ui";
import styles from "./GatewayStatusOverviewMetrics.module.css";

/** 汇总网关数量、健康分布和在线率，形成列表页的首屏运行快照。 */
export function GatewayStatusOverviewMetrics({
  list,
  averageUptime,
}: {
  list?: GatewayListView | null;
  averageUptime?: number | null;
}) {
  const uptimeText =
    averageUptime === null || averageUptime === undefined
      ? "—"
      : `${(averageUptime * 100).toFixed(1)}%`;
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <div className={styles.headerTitle}>全局网关概览</div>
          <div className={styles.headerSubtitle}>
            关键运行指标与最近状态快照
          </div>
        </div>
        {list ? (
          <span className={styles.headerMeta}>
            更新于 {new Date(list.updatedAt).toLocaleTimeString("zh-CN")}
          </span>
        ) : null}
      </div>
      <div className={styles.grid}>
        <MetricCard
          label="网关总数"
          value={list?.gatewayCount ?? "—"}
          hint="已注册的 WarpGateWay 实例总数"
          tone="accent"
        />
        <MetricCard
          label="在线"
          value={list?.onlineCount ?? "—"}
          hint="状态为 online 的实例数"
          tone="green"
        />
        <MetricCard
          label="降级"
          value={list?.degradedCount ?? "—"}
          hint="健康状态为 degraded 的实例数"
          tone="amber"
        />
        <MetricCard
          label="离线"
          value={list?.offlineCount ?? "—"}
          hint="状态为 offline 的实例数"
          tone="red"
        />
        <MetricCard
          label="平均在线率"
          value={uptimeText}
          hint="各实例近 1 小时在线率均值"
          tone="green"
        />
      </div>
    </div>
  );
}

/** 仅在 API 回退到示例数据时提示当前数据来源。 */
export function ExampleDataTag({ source }: { source?: "real" | "example" }) {
  if (source !== "example") return null;
  return (
    <div className={styles.exampleRow}>
      <ExampleTag />
      <span className={styles.exampleHint}>
        后端管理接口未就绪，当前展示内置示例数据。
      </span>
    </div>
  );
}
