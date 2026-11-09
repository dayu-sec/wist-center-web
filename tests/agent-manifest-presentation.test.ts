// 契约测试：数据清单在**卡片/详情页**上的排序与计数口径。
//
// 为什么钉：这是「用户第一眼看到什么」的规则。改错了不会报错，只会安静地把问题面
// 藏起来（例如降级项排到后面），或者把「已暂停」算成故障。
//
// Usage: npm run test:agent-manifest-presentation

import type {
  AgentCollectionEntry,
  AgentInvestigationEntry,
} from "../src/api";
import {
  collectionProblems,
  collectionSeverity,
  investigationProblems,
  sortCollectionBySeverity,
} from "../src/components/agentManifestPresentation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function entry(
  family: string,
  collectionStatus: string | null,
  status = "active",
): AgentCollectionEntry {
  return {
    family,
    workId: `w-${family}`,
    status,
    planVersion: 1,
    acknowledgedVersion: 1,
    collectionStatus,
    collectionDetail: null,
    inputs: [],
  };
}

function investigation(topic: string, overall: string): AgentInvestigationEntry {
  return {
    commandId: `c-${topic}-${overall}`,
    topic,
    observedAt: "2026-01-01T00:00:00Z",
    overall,
    verdict: overall,
    findingsOk: 1,
    findingsWarn: 0,
    findingsFail: 0,
    findingsUnknown: 0,
    judged: true,
  };
}

// 1) 严重度：失败 > 降级 > 未上报(null) > 未知 > 正常 > 已暂停。
assert(collectionSeverity(entry("F", "failed")) > collectionSeverity(entry("F", "degraded")), "失败应高于降级");
assert(collectionSeverity(entry("F", "degraded")) > collectionSeverity(entry("F", null)), "降级应高于未上报");
assert(collectionSeverity(entry("F", null)) > collectionSeverity(entry("F", "unknown")), "未上报应高于未知");
assert(collectionSeverity(entry("F", "unknown")) > collectionSeverity(entry("F", "ok")), "未知应高于正常");
assert(collectionSeverity(entry("F", "ok")) > collectionSeverity(entry("F", "paused")), "正常应高于已暂停");

// 2) 排序：问题面在前，暂停在最后；同严重度保持原顺序（稳定排序）。
const sorted = sortCollectionBySeverity([
  entry("ok-one", "ok"),
  entry("paused-one", "paused"),
  entry("degraded-one", "degraded"),
  entry("failed-one", "failed"),
  entry("ok-two", "ok"),
]);
assert(
  sorted.map((e) => e.family).join(",") === "failed-one,degraded-one,ok-one,ok-two,paused-one",
  `排序不对：${sorted.map((e) => e.family).join(",")}`,
);
// 不改原数组（缓存里是同一份对象，排序就地改会污染别处）。
const original = [entry("a", "ok"), entry("b", "failed")];
sortCollectionBySeverity(original);
assert(original[0].family === "a", "排序不应就地修改入参");

// 3) 段头/摘要计数：暂停不算问题；ok 不计数；null/unknown 都算「未上报」。
const problems = collectionProblems([
  entry("a", "failed"),
  entry("b", "degraded"),
  entry("c", "degraded"),
  entry("d", null),
  entry("e", "unknown"),
  entry("f", "ok"),
  entry("g", "failed", "paused"),
  entry("h", "ok", "paused"),
]);
assert(
  problems.failed === 1 && problems.degraded === 2 && problems.unreported === 2,
  `问题计数不对：${JSON.stringify(problems)}`,
);

// 4) 空入参：退化成零，不抛。
const none = collectionProblems([]);
assert(
  none.failed === 0 && none.degraded === 0 && none.unreported === 0,
  "空清单不应有问题计数",
);
assert(
  investigationProblems([]).failed === 0 && investigationProblems([]).warned === 0,
  "空清单不应有调查计数",
);

// 5) 调查结论计数：大小写不敏感；ok/unknown 不计。
const inv = investigationProblems([
  investigation("a", "FAIL"),
  investigation("b", "warn"),
  investigation("c", "Warn"),
  investigation("d", "ok"),
  investigation("e", "unknown"),
]);
assert(inv.failed === 1 && inv.warned === 2, `调查计数不对：${JSON.stringify(inv)}`);

console.log("agent manifest presentation contract test passed");
