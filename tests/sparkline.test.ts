// 契约测试：迷你趋势线的几何（`sparkline.ts`）。
//
// 为什么钉：折线画错不会报错，只会**骗人**——采样间隔不均时按等距铺点、或数值几乎不变时
// 把微小抖动放大成剧烈波动。这两种都只能靠用例守住。
//
// Usage: npm run test:sparkline

import {
  areaPath,
  buildSparkPoints,
  hasSparkData,
  polylinePoints,
  SPARK_HEIGHT,
  SPARK_WIDTH,
} from "../src/components/sparkline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Sample = { at: number; value: number | null };

const valueOf = (sample: Sample) => sample.value;

// 1) 没有采样 / 全空值 → 没有点（调用方据此不画线）。
assert(buildSparkPoints([], valueOf).length === 0, "空采样应得空点集");
assert(
  buildSparkPoints(
    [
      { at: 1, value: null },
      { at: 2, value: null },
    ],
    valueOf,
  ).length === 0,
  "整列为空不应产生点",
);
assert(
  !hasSparkData([{ at: 1, value: null }], valueOf),
  "全空值应判为无数据",
);
assert(hasSparkData([{ at: 1, value: 0 }], valueOf), "0 是有效值，应判为有数据");

// 2) x 按**真实时间**铺：采样间隔不均时不能等距。
const uneven = buildSparkPoints(
  [
    { at: 0, value: 1 },
    { at: 1, value: 2 },
    { at: 10, value: 3 },
  ],
  valueOf,
);
assert(uneven.length === 3, "三个有效值应得三个点");
assert(
  uneven[0].x === 0 && uneven[2].x === SPARK_WIDTH,
  `x 应铺满 0..${SPARK_WIDTH}，实际 ${uneven[0].x}..${uneven[2].x}`,
);
assert(
  uneven[1].x === 24,
  `中间点应按时间落在 24（1/10 * 240），实际 ${uneven[1].x}`,
);

// 3) y 落在 viewBox 内，且最小的值在下、最大的在上（SVG y 轴向下）。
assert(
  uneven.every((point) => point.y >= 0 && point.y <= SPARK_HEIGHT),
  `y 越界：${JSON.stringify(uneven)}`,
);
assert(
  uneven[0].y > uneven[2].y,
  `值小的应更靠下：${uneven[0].y} 应 > ${uneven[2].y}`,
);

// 4) 数值几乎不变时不能把抖动放大成满屏波动，也不能算出 NaN / Infinity。
const flat = buildSparkPoints(
  [
    { at: 0, value: 50 },
    { at: 10, value: 50 },
  ],
  valueOf,
);
assert(
  flat.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  `常数值不应产生非有限坐标：${JSON.stringify(flat)}`,
);
assert(flat[0].y === flat[1].y, "同值应得同一高度（水平线）");

// 5) 单个点：x 固定为起点，y 有限（调用方自己决定要不要画）。
const single = buildSparkPoints([{ at: 5, value: 7 }], valueOf);
assert(single.length === 1, "单点应得一个点");
assert(Number.isFinite(single[0].y), "单点 y 应有限");

// 6) 路径/点串格式：空点集给空串（面积路径），点串用 `x,y` 空格分隔。
assert(areaPath([]) === "", "空点集的面积路径应为空串");
assert(polylinePoints(uneven) === "0,27 24,14.5 240,2", `点串格式不对：${polylinePoints(uneven)}`);
assert(
  areaPath(uneven).startsWith(`M 0,${SPARK_HEIGHT} `) &&
    areaPath(uneven).endsWith("Z"),
  `面积路径应以底边起、闭合结尾：${areaPath(uneven)}`,
);

console.log("sparkline contract test passed");
