/**
 * 灰度阶段的分法（中心「发布 / 升级安装」口径）。
 *
 * 与 gateway-web 的 `agentUpgradePhases.ts` **同一套口径**：一个网关只能属于一个阶段（计划里
 * 阶段之间**互不重叠**），所以用「累计覆盖」的阶梯表达灰度 —— 每个阶段声明「覆盖到全部目标的
 * 多少」，相邻阶段的**新增** = 本次覆盖 − 上次覆盖；运维只选**阶段数**，不填任何 gateway_id。
 *
 * 阶梯固定：1 个（金丝雀）→ 10% → 30% → 70% → 全量（剩余）。选 K 个阶段时，取阶梯前 K-1 级作为
 * 中间切点，最后一级永远是「剩余全部」，保证一把铺满目标。
 *
 * 服务端**权威口径**在 Rust 侧 `wist-release::rollout`（中心与网关共用同一份）；这里只是让操作者
 * 在提交前能预览会切几段，真值以发布回执为准。改阶梯时两处一起改。
 */

/** 一个切点的覆盖口径：固定台数，或占目标总量的百分比。 */
type CoverageCut =
  | { kind: "count"; value: number }
  | { kind: "percent"; value: number };

/** 中间切点阶梯（「全量」由阶段数隐含，不在表里）。 */
const LADDER: CoverageCut[] = [
  { kind: "count", value: 1 }, // 金丝雀：1 台
  { kind: "percent", value: 10 },
  { kind: "percent", value: 30 },
  { kind: "percent", value: 70 },
];

/** 可选的阶段数：阶梯最多 4 个中间切点 + 一级「剩余」= 5 阶段。 */
export const PHASE_COUNTS = [2, 3, 4, 5] as const;

/**
 * 目标台数**能支持**的阶段数：每段至少 1 台，所以阶段数不能大于台数 —— 目标少时就不该多轮。
 * 只保留 ≤ 台数的预设；一台时退化为 `[1]`（不分批，一把到位）。
 */
export function availablePhaseCounts(total: number): number[] {
  if (total <= 0) return [];
  const feasible = PHASE_COUNTS.filter((count) => count <= total);
  return feasible.length > 0 ? [...feasible] : [1];
}

export interface AssignedPhase {
  /** 从 1 开始。 */
  index: number;
  /** 本阶段的 gateway_id（互不重叠，取自排序后的目标）。 */
  targetIds: string[];
  /**
   * 目标覆盖比例（**阶梯口径**，0..1）；金丝雀段为 `null`。
   * 展示阶梯上的那一级（如 10%）而非 `切点/台数` 的实现值（小目标上后者会被取整放大）。
   */
  coverage: number | null;
  /** 金丝雀段（首段且恰好 1 台）。 */
  isCanary: boolean;
  /** 收尾段（覆盖到全量）。 */
  isFinal: boolean;
}

/** 阶梯第 i 级的**目标**覆盖比例；这一级是台数（金丝雀）时返回 `null`。 */
function ladderCoverage(i: number): number | null {
  const cut = LADDER[Math.min(i, LADDER.length - 1)];
  return cut.kind === "percent" ? cut.value / 100 : null;
}

export interface PhasePlan {
  phases: AssignedPhase[];
  /** 分不出来时的原因（空目标 / 分段数大于台数）；`null` = 可分。 */
  error: string | null;
}

/** 一个切点折算成「覆盖几台」。 */
function cutSize(cut: CoverageCut, total: number): number {
  if (cut.kind === "count") return Math.min(cut.value, total);
  return Math.ceil((cut.value / 100) * total);
}

/**
 * 把目标切成 `phaseCount` 个互不重叠的阶段。
 *
 * 顺序取**排序后的 gateway_id**（确定、可复现）。累计覆盖保证切点单调不减，再夹到
 * `[上一切点 + 1, 台数 - 后面阶段数]`，确保每段**非空**；目标太少（分段数 > 台数）直接报错，
 * 而不是悄悄给出空阶段。
 */
export function planPhases(gatewayIds: string[], phaseCount: number): PhasePlan {
  const total = gatewayIds.length;
  const order = [...gatewayIds].sort();
  if (total === 0) {
    return { phases: [], error: "还没选任何网关，无法分配阶段。" };
  }
  if (phaseCount > total) {
    return {
      phases: [],
      error: `只选了 ${total} 个网关，分不出 ${phaseCount} 个非空阶段。`,
    };
  }

  const cuts: number[] = [];
  let previous = 0;
  for (let i = 0; i < phaseCount - 1; i += 1) {
    const cut = LADDER[Math.min(i, LADDER.length - 1)];
    // 给后面每个阶段留至少 1 台。
    const upper = total - (phaseCount - i - 1);
    const size = Math.max(previous + 1, Math.min(cutSize(cut, total), upper));
    cuts.push(size);
    previous = size;
  }
  cuts.push(total);

  const phases: AssignedPhase[] = [];
  let start = 0;
  for (let i = 0; i < cuts.length; i += 1) {
    const end = cuts[i];
    const targetIds = order.slice(start, end);
    phases.push({
      index: i + 1,
      targetIds,
      coverage: end === total ? 1 : ladderCoverage(i),
      // 金丝雀 = 首批且恰好 1 台；但若这一批就是全部（只选一个网关），不算金丝雀。
      isCanary: i === 0 && targetIds.length === 1 && end !== total,
      isFinal: end === total,
    });
    start = end;
  }
  return { phases, error: null };
}

/** 阶段的规模文字：金丝雀读「1 台」，其余读「覆盖 ~X%」。 */
export function phaseScaleLabel(phase: AssignedPhase): string {
  if (phase.isCanary) return "1 台（金丝雀）";
  return `覆盖 ~${Math.round((phase.coverage ?? 0) * 100)}%`;
}
