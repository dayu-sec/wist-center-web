import type { AgentHistory } from "../api";
import {
  buildSparkPoints,
  polylinePoints,
  SPARK_HEIGHT,
  SPARK_WIDTH,
  type SparkPoint,
} from "./sparkline";
import styles from "./AgentResourceTrend.module.css";

/**
 * 卡片上的**资源趋势迷你图**：CPU / 内存两条线，只画形状、**不标数值**。
 *
 * 为什么不标数值：卡片上方已经有「内存 65 MB · CPU 21.4%」的当前值，图上再标一遍
 * 就是同一句话说了两次。图的作用是回答「刚才有没有抖动」，数值那行回答「现在多少」。
 *
 * 一个采样点画不出趋势（会是一条看起来像真实测量的直线），所以少于 2 个采样时
 * 退化成一句说明，而不是硬画。
 */
export function AgentResourceTrend({
  history,
  loading,
}: {
  history?: AgentHistory | null;
  loading?: boolean;
}) {
  const samples = history?.samples ?? [];
  const cpu = buildSparkPoints(samples, (sample) => sample.cpuPercent);
  const memory = buildSparkPoints(samples, (sample) => sample.memoryBytes);

  if (samples.length < 2 || (cpu.length === 0 && memory.length === 0)) {
    return (
      <div className={styles.state}>
        {loading
          ? "加载趋势…"
          : `趋势采样不足（${samples.length} 个）`}
      </div>
    );
  }

  return (
    <div className={styles.root} aria-label="最近 1 小时资源趋势">
      <SparkRow label="CPU" color="var(--series-1)" points={cpu} />
      <SparkRow label="内存" color="var(--series-3)" points={memory} />
    </div>
  );
}

function SparkRow({
  label,
  color,
  points,
}: {
  label: string;
  color: string;
  points: SparkPoint[];
}) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>
        <i className={styles.dot} style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
      <svg
        className={styles.spark}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} 最近 1 小时趋势`}
      >
        {/* 点个数判空：空数组是真值，不能用 `points ?` 判断。 */}
        {points.length > 0 ? (
          <polyline
            className={styles.line}
            points={polylinePoints(points)}
            stroke={color}
          />
        ) : null}
      </svg>
    </div>
  );
}
