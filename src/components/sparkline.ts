// 迷你趋势线的几何计算 —— 纯函数，单独一处便于契约测试。
//
// 两处共用：网关/Agent 详情页的趋势面板（带数值）与卡片上的资源迷你图（只有形状）。
// 口径统一成「按真实采样时间铺 x、按值域铺 y」，否则采样间隔不均时折线会骗人。

/** viewBox 尺寸：与卡片宽度无关，`preserveAspectRatio="none"` 负责拉伸。 */
export const SPARK_WIDTH = 240;
export const SPARK_HEIGHT = 30;

export interface SparkPoint {
  x: number;
  y: number;
}

/** 采样里至少有一个有效值时才有形状可画。 */
export function hasSparkData<T extends { at: number }>(
  samples: T[],
  valueOf: (sample: T) => number | null | undefined,
): boolean {
  return samples.some((sample) => {
    const value = valueOf(sample);
    return value !== null && value !== undefined;
  });
}

/**
 * 生成折线点（x/y 已落到 viewBox 坐标系）。
 *
 * - x 按**真实采样时间**归一：采样间隔不均时不会把点挤成等距（那是另一种谎言）。
 * - y 按值域铺开，且给最小跨度（`|max| * 8%`）兜底：整列数值几乎不变时，
 *   否则会被放大成剧烈抖动。
 * - 没有有效值 → 空数组（调用方必须按「点的个数」判空，不能按空数组真值判断）。
 */
export function buildSparkPoints<T extends { at: number }>(
  samples: T[],
  valueOf: (sample: T) => number | null | undefined,
): SparkPoint[] {
  const raw = samples.flatMap((sample) => {
    const value = valueOf(sample);
    return value === null || value === undefined
      ? []
      : [{ at: sample.at, value }];
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
    x: Number((((point.at - minAt) / timeRange) * SPARK_WIDTH).toFixed(1)),
    y: Number(
      (
        SPARK_HEIGHT -
        3 -
        ((point.value - minValue) / valueRange) * (SPARK_HEIGHT - 5)
      ).toFixed(1),
    ),
  }));
}

/** 折线 `points` 属性。 */
export function polylinePoints(points: SparkPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/** 面积填充路径（折线 + 回到底边闭合）；没有点时返回空串。 */
export function areaPath(points: SparkPoint[]): string {
  if (points.length === 0) return "";
  return (
    `M ${points[0].x},${SPARK_HEIGHT} ` +
    points.map((point) => `L ${point.x},${point.y}`).join(" ") +
    ` L ${points[points.length - 1].x},${SPARK_HEIGHT} Z`
  );
}
