import {
  normalizeCompatManifest,
  normalizeCompatReport,
  normalizePackage,
} from "../src/api/admin";
import {
  compatLabel,
  compatSummary,
  compatTone,
} from "../src/components/compatReport";

// 契约测试：包管理页的「兼容范围 + 检查结果」。
//
// 三条最容易漂移、漂了又不报错的地方：
//   1. 后端是 snake_case（`checked_at` / `coexists_with`），页面类型是 camelCase；
//   2. `unknown`（包内没声明）必须落成**灰**且文案说“未验证”，不能被当成绿色“兼容”；
//   3. 老后端 / 缺字段 → 报告为 null（显示“未检查”），不能抛错把整张表打挂。
//
// Usage: npm run test:release-compat

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── 1. 包 → 兼容声明 + 报告 ────────────────────────────────────────────────

const payload = {
  component: "wist-agentd",
  version: "0.1.20",
  published_at: "2026-10-29T00:00:00Z",
  status: "published",
  artifacts: [{ platform: "aarch64-apple-darwin", sha256: "ab", source: "u" }],
  compat: {
    component: "wist-agentd",
    version: "0.1.20",
    requires: { "wist-gateway": ">=0.9.0 <0.10.0" },
    supports: { "wist-agentd": ">=0.1.12" },
    coexists_with: { "wist-gateway": ">=0.8.0" },
    compat_mode: true,
    bridge: ["0.1.16"],
    reversible: false,
  },
  compatibility: {
    status: "warn",
    checked_at: "2026-10-29T01:02:03Z",
    current: { "wist-gateway": "0.8.6" },
    checks: [
      {
        package: "wist-agentd",
        version: "0.1.20",
        peer: "wist-gateway",
        required: ">=0.9.0 <0.10.0",
        actual: "0.8.6",
        ok: false,
        severity: "warn",
        message: "`wist-gateway` 0.8.6 不在范围内（兼容模式下可共存）",
      },
    ],
  },
};

const release = normalizePackage(payload);
assert(
  release.compat?.coexistsWith["wist-gateway"] === ">=0.8.0",
  `coexists_with 没映射成 coexistsWith：${JSON.stringify(release.compat)}`,
);
assert(release.compat?.compatMode === true, "compat_mode 没映射成 compatMode");
assert(
  release.compat?.requires["wist-gateway"] === ">=0.9.0 <0.10.0",
  "requires 丢了",
);
assert(release.compat?.bridge.length === 1, "bridge 丢了");
assert(
  release.compatibility?.checkedAt === "2026-10-29T01:02:03Z",
  `checked_at 没映射成 checkedAt：${release.compatibility?.checkedAt}`,
);
assert(
  release.compatibility?.current["wist-gateway"] === "0.8.6",
  "current 版本向量丢了",
);
assert(
  release.compatibility?.checks[0]?.severity === "warn" &&
    release.compatibility?.checks[0]?.ok === false,
  "检查条目丢了",
);

// ── 2. 缺字段 / 老后端：不许抛错，也不许臆造 ok ────────────────────────────

const bare = normalizePackage({
  component: "wist-gateway-stack",
  version: "0.1.28",
  status: "published",
  published_at: "2026-10-29T00:00:00Z",
});
assert(bare.compat === null, "没有 compat 时应为 null");
assert(bare.compatibility === null, "没有 compatibility 时应为 null");

assert(
  normalizeCompatReport(undefined) === null,
  "undefined 报告应为 null",
);
assert(
  normalizeCompatReport({ status: "weird" }) === null,
  "未知 status 应为 null（不猜）",
);
assert(
  normalizeCompatManifest(null) === null,
  "null manifest 应为 null",
);
const emptyManifest = normalizeCompatManifest({});
assert(
  emptyManifest !== null &&
    Object.keys(emptyManifest.requires).length === 0 &&
    emptyManifest.compatMode === false &&
    emptyManifest.reversible === false,
  `空 manifest 应给出空范围与 false：${JSON.stringify(emptyManifest)}`,
);

// ── 3. 颜色 / 文案：unknown 是灰，绝不显示成绿色 ────────────────────────────

assert(compatTone("ok") === "green", "ok 应是绿色");
assert(compatTone("warn") === "amber", "warn 应是黄色");
assert(compatTone("error") === "red", "error 应是红色");
assert(compatTone("unknown") === "gray", "unknown 必须是灰色");

assert(compatLabel("unknown") === "未验证", `unknown 文案：${compatLabel("unknown")}`);
assert(compatLabel("error") === "不兼容", `error 文案：${compatLabel("error")}`);

assert(compatSummary(null) === "未检查", "没有报告时摘要应是“未检查”");
assert(
  compatSummary({
    status: "ok",
    checkedAt: "",
    current: {},
    checks: [
      {
        package: "p",
        version: "1",
        peer: "q",
        required: ">=1",
        actual: "1",
        ok: true,
        severity: "ok",
        message: "fine",
      },
    ],
  }) === "范围都满足",
  "ok 摘要",
);
assert(
  compatSummary(release.compatibility) === "1 项告警",
  `warn 摘要应数出非 ok 条目：${compatSummary(release.compatibility)}`,
);

console.log("release-compat-contract: ok");
