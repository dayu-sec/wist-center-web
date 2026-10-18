import {
  pickSingleAsset,
  resolvedAssetsComponentError,
  validateArtifactRow,
  validateSingleArtifact,
  type ArtifactRow,
} from "../src/packageForm";
import type { ResolvedGitHubAsset } from "../src/api";
import { sha256Error } from "../src/sha256";

// 集成测试：`PackagePanel` 两个表单（单制品 / 多平台）的**提交前校验流程**。
//
// 这里测「组件级」逻辑（提交 / 一键解析时会走的那条链），而非解析函数本身（后者在
// `artifact-name.test.ts`）。钉住三件事：
//   1. 组件不符优先于摘要格式（组件都错了就不必再纠摘要）；
//   2. 多平台逐行「空地址 → 组件不符 → 摘要格式」的先后；
//   3. 一键解析填充后，整批制品里的「组件不符」能当场浮出来；
//   4. 单制品表单从一批解析结果里选件时，跳过别的组件、取第一个能用的。
//
// Usage: npm run test:package-form

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

const AGENTD = "wist-agentd";
const GOOD_SHA = "a".repeat(64);
const AGENTD_URL =
  "https://x.example/wist-agentd-v0.2.1-alpha-aarch64-apple-darwin.tar.gz";
const GWLINKD_URL =
  "https://x.example/wist-gwlinkd-v0.7.1-alpha-aarch64-apple-darwin.tar.gz";
// 组件只在目录里、文件名只有版本 → 读不出包名 → 一律放行（交给中心下载后定夺）。
const NAMELESS_URL =
  "https://artifacts.example.com/wist-agentd/v2.4.1-aarch64-apple-darwin.tar.gz";

// ── 单制品表单：组件不符优先于摘要格式 ──
{
  const { url, sha } = validateSingleArtifact(AGENTD, GWLINKD_URL, GOOD_SHA);
  assert(url !== null && url.includes("wist-gwlinkd"), `single url: ${url}`);
  // 即便摘要也不对，`url` 仍单独命中 —— 表单会先报组件、不再看摘要（`sha` 由调用方决定用不用）。
  assert(sha === null, "single: valid sha still reports null");

  const ok = validateSingleArtifact(AGENTD, AGENTD_URL, GOOD_SHA);
  assertEqual(ok.url, null, "single: matching component passes");
  assertEqual(ok.sha, null, "single: valid sha passes");

  const badSha = validateSingleArtifact(AGENTD, AGENTD_URL, "deadbeef");
  assertEqual(badSha.url, null, "single: matching component passes");
  assert(badSha.sha !== null, "single: bad sha flagged");

  // 来源读不出包名 → 放行。
  assertEqual(
    validateSingleArtifact(AGENTD, NAMELESS_URL, GOOD_SHA).url,
    null,
    "single: nameless source defers",
  );
}

// ── 多平台表单：逐行「空地址 → 组件不符 → 摘要格式」 ──
{
  const row = (
    artifactUrl: string,
    expectedSha256 = GOOD_SHA,
  ): ArtifactRow => ({
    artifactUrl,
    expectedSha256,
  });

  assertEqual(
    validateArtifactRow(AGENTD, row("   ")),
    "请填写该平台的产物地址。",
    "row: empty url first",
  );
  // 空地址与组件不符同时存在时，先报空地址。
  assertEqual(
    validateArtifactRow(AGENTD, row("")),
    "请填写该平台的产物地址。",
    "row: empty url precedes mismatch",
  );

  const mismatch = validateArtifactRow(AGENTD, row(GWLINKD_URL));
  assert(mismatch !== null && mismatch.includes("wist-gwlinkd"), `${mismatch}`);
  // 组件不符优先于摘要：摘要也错时仍旧报组件。
  const bothWrong = validateArtifactRow(AGENTD, row(GWLINKD_URL, "nope"));
  assert(
    bothWrong !== null && bothWrong.includes("wist-gwlinkd"),
    `row: mismatch precedes sha: ${bothWrong}`,
  );

  assertEqual(
    validateArtifactRow(AGENTD, row(AGENTD_URL, "nope")),
    sha256Error("nope"),
    "row: falls through to sha",
  );
  assertEqual(
    validateArtifactRow(AGENTD, row(AGENTD_URL)),
    null,
    "row: all good",
  );
  assertEqual(
    validateArtifactRow(AGENTD, row(NAMELESS_URL)),
    null,
    "row: nameless source defers",
  );
}

// ── 一键解析（GitHub Release）后：整批制品的组件预检 ──
{
  assertEqual(
    resolvedAssetsComponentError(AGENTD, [AGENTD_URL, AGENTD_URL, AGENTD_URL]),
    null,
    "resolve: all match",
  );
  const err = resolvedAssetsComponentError(AGENTD, [AGENTD_URL, GWLINKD_URL]);
  assert(err !== null && err.includes("wist-gwlinkd"), `resolve: ${err}`);
  assertEqual(
    resolvedAssetsComponentError(AGENTD, [NAMELESS_URL, AGENTD_URL]),
    null,
    "resolve: nameless sources defer",
  );
  assertEqual(
    resolvedAssetsComponentError(AGENTD, []),
    null,
    "resolve: empty batch passes",
  );
}

// ── 单制品表单：从一批解析结果里选件 ──
{
  const asset = (artifactUrl: string): ResolvedGitHubAsset => ({
    name: artifactUrl.split("/").pop() ?? artifactUrl,
    artifactUrl,
    sha256: GOOD_SHA,
    platform: null,
  });
  const STACK_URL =
    "https://x.example/wist-gateway-stack-v0.1.40-alpha.tar.gz";

  assertEqual(
    pickSingleAsset("wist-gateway-stack", [asset(STACK_URL)])?.artifactUrl,
    STACK_URL,
    "single pick: matching single artifact",
  );
  // 同一 Release 常把校验和边车与制品并列：不能把 `.sha256` 填进产物地址。
  assertEqual(
    pickSingleAsset("wist-gateway-stack", [
      asset(`${STACK_URL}.sha256`),
      asset(STACK_URL),
    ])?.artifactUrl,
    STACK_URL,
    "single pick: skips checksum sidecars",
  );
  // 同一批解析结果里混了别的组件：跳过它，取第一个能用的。
  assertEqual(
    pickSingleAsset(AGENTD, [asset(GWLINKD_URL), asset(AGENTD_URL)])?.artifactUrl,
    AGENTD_URL,
    "single pick: skips the wrong component",
  );
  // 读不出包名的制品一律放行（交给中心下载后定夺），按解析顺序取第一个。
  assertEqual(
    pickSingleAsset(AGENTD, [asset(NAMELESS_URL), asset(AGENTD_URL)])?.artifactUrl,
    NAMELESS_URL,
    "single pick: nameless source defers and wins by order",
  );
  assertEqual(
    pickSingleAsset(AGENTD, [asset(GWLINKD_URL)]),
    null,
    "single pick: no compatible artifact",
  );
  assertEqual(
    pickSingleAsset(AGENTD, []),
    null,
    "single pick: empty batch",
  );
}

console.log("package-form 集成测试通过");
