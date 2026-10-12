import {
  componentMismatchError,
  packageNameFromArtifactUrl,
} from "../src/artifactName";

// 契约测试：「组件 ↔ 包」的**来源侧**预检（表单提交前）。
//
// 与中心 Rust（`wist-center` 的 `api/admin_ops.rs::source_component_mismatch` /
// `infra/package.rs::read_source_package_name`）同口径钉住两件事：
//   1. 来源文件名切得出组件名（`<name>-<version>[-<triple>]` 的 `<name>`）—— 与中心同表；
//   2. 切得出且与目标组件不符 → 报错；切不出（`pkg-<hash>` / 临时名 / 只有版本）→ 放行，
//      交给中心下载后的完整校验定夺。
//
// Usage: npm run test:artifact-name

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// 1. 从真实发布地址里取组件名。
const cases: Array<[string, string]> = [
  [
    "https://github.com/dayu-sec/wist-gwlinkd/releases/download/v0.7.1-alpha/wist-gwlinkd-v0.7.1-alpha-aarch64-apple-darwin.tar.gz",
    "wist-gwlinkd",
  ],
  [
    "https://github.com/galaxio-labs/galaxy-flow/releases/download/v0.16.1-alpha/galaxy-flow-v0.16.1-alpha-x86_64-unknown-linux-musl.tar.gz",
    "galaxy-flow",
  ],
  ["wist-gateway-stack-0.1.17.tar.gz", "wist-gateway-stack"],
  ["/var/pkg/wist-agentd-0.1.34.bin", "wist-agentd"],
  [
    // 查询串 / fragment 先剥掉，只看末段。
    "https://x.example/wist-agentd-v0.2.1-alpha-aarch64-apple-darwin.tar.gz?token=abc#frag",
    "wist-agentd",
  ],
];
for (const [source, expected] of cases) {
  assertEqual(packageNameFromArtifactUrl(source), expected, source);
}

// 读不出包名 → 空串（调用方据此放行）。
for (const source of [
  "v2.4.1-aarch64-apple-darwin.tar.gz",
  "pkg-955e0dc75215c3a6",
  "/tmp/wic-rel-1728.tar.gz",
  "",
  "https://x.example/",
]) {
  assertEqual(packageNameFromArtifactUrl(source), "", `no-name: ${source}`);
}
// 首段是已知架构词不算三元组（否则会把包名当成架构）。
assertEqual(
  packageNameFromArtifactUrl("arm-tool-2.0.0.tar.gz"),
  "arm-tool",
  "first-segment arch",
);

// 2. 预检：把 gwlinkd 包录成 agentd → 报错并指出该发到哪。
const mismatch = componentMismatchError(
  "wist-agentd",
  "https://x.example/wist-gwlinkd-v0.7.1-alpha-aarch64-apple-darwin.tar.gz",
);
assert(mismatch !== null, "should flag the mismatch");
assert(mismatch.includes("wist-gwlinkd"), mismatch);
// 文案同时点出「实际包名」与「当前组件」，并给出该去哪。
assert(mismatch.includes("wist-agentd"), mismatch);
assert(mismatch.includes("组件"), mismatch);
// 组件对得上 → 放行。
assertEqual(
  componentMismatchError(
    "wist-agentd",
    "https://x.example/wist-agentd-v0.2.1-alpha-x86_64-unknown-linux-musl.tar.gz",
  ),
  null,
  "matching component passes",
);
// 来源读不出包名 → 放行（交给中心下载后定夺）。
assertEqual(
  componentMismatchError(
    "wist-agentd",
    "https://artifacts.example.com/wist-agentd/v2.4.1-aarch64-apple-darwin.tar.gz",
  ),
  null,
  "unresolvable source passes",
);

console.log("artifact-name 契约测试通过");
