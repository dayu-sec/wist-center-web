import type { GatewayHistory, GatewayHistorySample } from "../api";
import { formatBytes, formatDuration, formatPercent } from "./ui";
import styles from "./GatewayHistoryChart.module.css";

interface GatewayHistoryChartProps {
  history?: GatewayHistory | null;
  loading?: boolean;
  source?: "real" | "example";
  title?: string;
  compact?: boolean;
}

type SampleValue = (
  sample: GatewayHistorySample,
) => number | null | undefined;

const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 30;

/** 在网关概览中展示最近窗口的 CPU、内存趋势和在线时间轴。 */
export function GatewayHistoryChart({
  history,
  loading,
  source,
  title = "最近 1 小时",
  compact = false,
}: GatewayHistoryChartProps) {
  const samples = history?.samples ?? [];
  if (loading && samples.length === 0) {
    return (
      <div className={`${styles.state} ${compact ? styles.compact : ""}`}>
        正在加载最近 1 小时趋势…
      </div>
    );
  }
  if (samples.length === 0) {
    return (
      <div className={`${styles.state} ${compact ? styles.compact : ""}`}>
        <strong>最近 1 小时暂无历史样本</strong>
        <span>配置 VictoriaMetrics 并持续上报后将在这里生成趋势。</span>
      </div>
    );
  }

  const firstAt = samples[0]?.at;
  const lastAt = samples[samples.length - 1]?.at;
  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ""}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{title}</div>
          <div className={styles.timeRange}>
            {formatSampleTime(firstAt)}–{formatSampleTime(lastAt)}
          </div>
        </div>
        <div className={styles.headerMeta}>
          {source === "example" ? (
            <span className={styles.example}>示例</span>
          ) : null}
          <span>{samples.length} 个采样</span>
        </div>
      </div>

      <TrendRow
        id="cpu"
        label="CPU"
        color="var(--series-1)"
        value={formatPercent(
          latestValue(samples, (sample) => sample.cpuPercent),
        )}
        samples={samples}
        valueOf={(sample) => sample.cpuPercent}
      />
      <TrendRow
        id="mem"
        label="内存"
        color="var(--series-3)"
        value={formatBytes(
          latestValue(samples, (sample) => sample.memoryBytes),
        )}
        samples={samples}
        valueOf={(sample) => sample.memoryBytes}
      />
      {/* 富化趋势：只在样本里有这条序列时渲染，老数据/agent 紧凑图不显示空行。 */}
      {hasData(samples, (sample) => sample.uptimeSeconds) ? (
        <TrendRow
          id="uptime"
          label="运行时长"
          color="var(--series-2)"
          value={formatDuration(
            latestValue(samples, (sample) => sample.uptimeSeconds),
          )}
          samples={samples}
          valueOf={(sample) => sample.uptimeSeconds}
        />
      ) : null}
      {hasData(samples, (sample) => sample.onlineAgents) ? (
        <TrendRow
          id="agents"
          label="在线 Agent"
          color="var(--series-4)"
          value={formatAgentCount(samples)}
          samples={samples}
          valueOf={(sample) => sample.onlineAgents}
        />
      ) : null}
      {hasData(samples, (sample) => sample.lastSeenLagSeconds) ? (
        <TrendRow
          id="lag"
          label="上报时延"
          color="var(--series-5)"
          value={formatSeconds(
            latestValue(samples, (sample) => sample.lastSeenLagSeconds),
          )}
          samples={samples}
          valueOf={(sample) => sample.lastSeenLagSeconds}
        />
      ) : null}
      {hasData(samples, (sample) => sample.storeBytes) ? (
        <TrendRow
          id="store"
          label="存储"
          color="var(--series-6)"
          value={formatBytes(
            latestValue(samples, (sample) => sample.storeBytes),
          )}
          samples={samples}
          valueOf={(sample) => sample.storeBytes}
        />
      ) : null}
      {hasData(samples, (sample) => sample.load1m) ? (
        <TrendRow
          id="load"
          label="负载 1m"
          color="var(--series-2)"
          value={formatLoad(latestValue(samples, (sample) => sample.load1m))}
          samples={samples}
          valueOf={(sample) => sample.load1m}
        />
      ) : null}
      {hasData(samples, (sample) => sample.diskUsagePercent) ? (
        <TrendRow
          id="disk"
          label="磁盘"
          color="var(--series-3)"
          value={formatPercent(
            latestValue(samples, (sample) => sample.diskUsagePercent),
          )}
          samples={samples}
          valueOf={(sample) => sample.diskUsagePercent}
        />
      ) : null}
      <div className={styles.availabilityRow}>
        <span className={styles.rowLabel}>在线</span>
        <div className={styles.availability} aria-label="最近 1 小时在线状态">
          {samples.map((sample) => (
            <span
              key={sample.at}
              className={
                sample.online === null
                  ? styles.unknownSegment
                  : sample.online >= 0.5
                    ? styles.onlineSegment
                    : styles.offlineSegment
              }
              title={`${formatSampleTime(sample.at)} ${
                sample.online === null
                  ? "无数据"
                  : sample.online >= 0.5
                    ? "在线"
                    : "离线"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 单条趋势线：面积渐变 + 折线，与主控制台的迷你趋势线同一形态
 * —— 只有折线时几十个采样点会挤成一根线，读不出量级。
 */
function TrendRow({
  id,
  label,
  value,
  color,
  samples,
  valueOf,
}: {
  id: string;
  label: string;
  value: string;
  color: string;
  samples: GatewayHistorySample[];
  valueOf: SampleValue;
}) {
  const points = buildPoints(samples, valueOf);
  const gradientId = `gw-trend-${id}`;
  const area = points
    ? `M ${points[0].x},${VIEW_HEIGHT} ` +
      points.map((point) => `L ${point.x},${point.y}`).join(" ") +
      ` L ${points[points.length - 1].x},${VIEW_HEIGHT} Z`
    : "";

  return (
    <div className={styles.trendRow}>
      <span className={styles.rowLabel}>{label}</span>
      <svg
        className={styles.sparkline}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} 最近 1 小时趋势`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {points ? (
          <>
            <path d={area} fill={`url(#${gradientId})`} />
            <polyline
              className={styles.line}
              points={points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              stroke={color}
            />
          </>
        ) : null}
      </svg>
      <strong className={styles.rowValue}>{value}</strong>
    </div>
  );
}

/** 按实际采样时间和序列值域生成折线点（x/y 已落到 viewBox 坐标系）。 */
function buildPoints(
  samples: GatewayHistorySample[],
  valueOf: SampleValue,
): { x: number; y: number }[] {
  const raw = samples.flatMap((sample) => {
    const value = valueOf(sample);
    return value === null || value === undefined ? [] : [{ at: sample.at, value }];
  });
  if (raw.length === 0) return [];
  const minAt = raw[0].at;
  const maxAt = raw[raw.length - 1].at;
  const values = raw.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const timeRange = Math.max(maxAt - minAt, 1);
  const valueRange = Math.max(maxValue - minValue, Math.abs(maxValue) * 0.08, 1);
  return raw.map((point) => ({
    x: Number((((point.at - minAt) / timeRange) * VIEW_WIDTH).toFixed(1)),
    y: Number(
      (
        VIEW_HEIGHT -
        3 -
        ((point.value - minValue) / valueRange) * (VIEW_HEIGHT - 5)
      ).toFixed(1),
    ),
  }));
}

function latestValue(
  samples: GatewayHistorySample[],
  valueOf: SampleValue,
): number | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const value = valueOf(samples[index]);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** 样本里是否至少有一个非空值；没有就整行不渲染（老数据缺序列）。 */
function hasData(
  samples: GatewayHistorySample[],
  valueOf: SampleValue,
): boolean {
  return samples.some((sample) => {
    const value = valueOf(sample);
    return value !== null && value !== undefined;
  });
}

/** 在线 Agent 显示为「在线 / 总数」。 */
function formatAgentCount(samples: GatewayHistorySample[]): string {
  const online = latestValue(samples, (sample) => sample.onlineAgents);
  const total = latestValue(samples, (sample) => sample.agentCount);
  if (online === null && total === null) return "—";
  return `${online ?? "—"} / ${total ?? "—"}`;
}

function formatSeconds(value: number | null): string {
  if (value === null) return "—";
  if (value >= 60) return `${(value / 60).toFixed(1)} 分`;
  return `${value.toFixed(0)} 秒`;
}

function formatLoad(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatSampleTime(at?: number): string {
  if (at === undefined) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at * 1000));
}
