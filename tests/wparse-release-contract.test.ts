import {
  defaultWparseTag,
  shortWparseCommit,
  validWparseTag,
  wparsePlanTargetCount,
} from "../src/components/wparseRelease";

// 契约测试：规则 / 配置发布入口的 tag 候选口径。
//
// 锁住四件事：
//   1. 默认选最新（列表已由服务端按 semver 降序排好）；
//   2. 本地 tag 形状与服务端 `valid_release_tag` 一致；
//   3. commit 展示不会把空值渲染成空白；
//   4. 发布回执覆盖的台数从**计划阶段**里数（批准前条目全 pending）。
//
// Usage: npm run test:wparse-release

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  defaultWparseTag([
    { tag: "v1.10.0", commit: null, committedAt: null },
    { tag: "v1.9.0", commit: null, committedAt: null },
  ]) === "v1.10.0",
  "默认应选列表第一个（服务端已按 semver 降序）",
);
assert(defaultWparseTag([]) === "", "没有候选时默认值为空串");

for (const tag of ["v1.2.3", "1.2.3", "v1.2.3-alpha", "release_2026.10"]) {
  assert(validWparseTag(tag), `${tag} 应当是合法 tag`);
}
for (const tag of ["", "../etc", "v1.2.3/../../x", "v 1.2.3", "a".repeat(65)]) {
  assert(!validWparseTag(tag), `${tag} 应当被拒绝`);
}
assert(validWparseTag("  v1.2.3  "), "前后空白应被 trim");

assert(shortWparseCommit(null) === "—", "空 commit 显示 —");
assert(
  shortWparseCommit("abcdef1234567890") === "abcdef123456",
  `commit 应截 12 位：${shortWparseCommit("abcdef1234567890")}`,
);

assert(wparsePlanTargetCount({ phases: [] }) === 0, "空计划 = 0 台");
assert(
  wparsePlanTargetCount({
    phases: [
      { targetIds: ["gw-1"] },
      { targetIds: ["gw-2", "gw-3"] },
    ],
  }) === 3,
  "多阶段应求和（服务端保证一个网关只落一个阶段）",
);

console.log("wparse-release contract: ok");
