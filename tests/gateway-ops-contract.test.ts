import {
  commandStateLabel,
  commandStateTone,
  diagnoseStatusLabel,
  diagnoseStatusTone,
  isTerminalCommandState,
  sortDiagnoseChecks,
  summarizeDiagnose,
} from "../src/components/gatewayOps";

// 契约测试：「运行时操作」面板的三条判定口径。
//
// 这些判定直接决定页面会不会**谎报**，所以单独锁住：
//   1. **终态**只认 done / failed / expired —— 认不出的状态继续轮询（宁可能多问几次，
//      也不能把“还在跑”提前当成“结束了”）；
//   2. 三类计数优先用报告自带的 `summary`，缺失时从 `checks` 现数（老 gops 没有 summary）；
//   3. 颜色：`fail` 红、`warn` 黄、认不出的灰（**不能**把未知画成绿色）。
//
// Usage: npm run test:gateway-ops

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 1) 终态判定
for (const state of ["done", "failed", "expired"]) {
  assert(isTerminalCommandState(state), `${state} 应当是终态`);
}
for (const state of ["pending", "leased", "weird", "", null, undefined]) {
  assert(
    !isTerminalCommandState(state as string | null | undefined),
    `${String(state)} 不应被当成终态（会让轮询提前停止）`,
  );
}

// 2) 汇总：优先 summary
const withSummary = summarizeDiagnose({
  summary: { ok: 7, warn: 1, fail: 2, exit_code: 1 },
  checks: [],
});
assert(
  withSummary.ok === 7 && withSummary.warn === 1 && withSummary.fail === 2,
  `summary 原样透出：${JSON.stringify(withSummary)}`,
);

// 2b) 汇总：没有 summary 时从 checks 现数（未知状态不计入任何一类）
const fallback = summarizeDiagnose({
  checks: [
    { code: "a", status: "ok", title: "" },
    { code: "b", status: "warn", title: "" },
    { code: "c", status: "fail", title: "" },
    { code: "d", status: "unknown", title: "" },
  ],
});
assert(
  fallback.ok === 1 && fallback.warn === 1 && fallback.fail === 1,
  `checks 兜底计数：${JSON.stringify(fallback)}`,
);
assert(
  summarizeDiagnose(null).fail === 0,
  "没有报告时计数全 0（不能显示 NaN）",
);

// 3) 颜色与文案
assert(diagnoseStatusTone("fail") === "red", "fail 必须是红色");
assert(diagnoseStatusTone("warn") === "amber", "warn 必须是黄色");
assert(diagnoseStatusTone("ok") === "green", "ok 必须是绿色");
assert(
  diagnoseStatusTone("something-new") === "gray",
  "认不出的状态必须是灰色（不能画成正常）",
);
assert(diagnoseStatusLabel("ok") === "正常", "ok 文案");
assert(commandStateLabel("leased") === "执行中", "leased 文案");
assert(commandStateTone("leased") === "blue", "执行中应当是蓝色");
assert(commandStateTone("failed") === "red", "失败应当是红色");

// 4) 排序：失败 → 警告 → 正常，同级按 code
const sorted = sortDiagnoseChecks([
  { code: "gops.z", status: "ok" },
  { code: "wparse.work_drift", status: "fail" },
  { code: "gops.b", status: "warn" },
  { code: "gops.a", status: "warn" },
]);
assert(
  sorted.map((item) => item.code).join(",") ===
    "wparse.work_drift,gops.a,gops.b,gops.z",
  `排序不稳定：${sorted.map((item) => item.code).join(",")}`,
);

console.log("gateway-ops contract: ok");
