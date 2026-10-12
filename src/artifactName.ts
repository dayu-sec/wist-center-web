/**
 * 「组件 ↔ 包」的来源侧预检（表单**提交前**）。
 *
 * 权威口径在中心侧 Rust（`wist-center` 的 `api/admin_ops.rs::source_component_mismatch` +
 * `infra/package.rs::read_source_package_name`，读不出再回落包内顶层目录名）。这里做同一套规则的
 * **来源文件名版**，让「发错组件」在**提交前**当场说清 —— 不必等中心下载完制品、落到批量提交回执才报。
 *
 * 只解析来源末段的形态（不下载、不看包内），故与中心最多在「来源读不出包名」时口径不同：
 * 那种情况一律**放行**，交给中心下载后的完整校验定夺。
 */

/** 目标三元组的已知架构名（与中心 / 网关侧同表）。 */
const KNOWN_ARCHES = [
  "aarch64",
  "x86_64",
  "i686",
  "i586",
  "armv7",
  "armv6",
  "arm",
  "riscv64",
  "powerpc64",
  "powerpc64le",
  "s390x",
  "x86_64h",
  "loongarch64",
];

/** 段是否像版本号：可选 `v` 前缀 + 至少 `N.N`（与中心 `looks_like_version` 同口径）。 */
function looksLikeVersion(segment: string): boolean {
  const rest = segment.replace(/^[vV]/, "");
  const parts = rest.split(".");
  if (parts.length < 2) return false;
  const [head, second] = parts;
  return head.length > 0 && /^[0-9]+$/.test(head) && /^[0-9]/.test(second);
}

/** 来源末段（去查询串 / fragment 与压缩 / 裸二进制后缀）。 */
function artifactBasename(source: string): string {
  return (source.split(/[?#]/)[0].split("/").pop() ?? "").replace(
    /\.(tar\.gz|tar\.bz2|tar\.xz|tgz|tar|gz|zip|bin)$/i,
    "",
  );
}

/**
 * 从制品来源（URL / 路径）的末段解析**组件名**（`<name>-<version>[-<triple>]` 里的 `<name>`）；
 * 读不出返回 `""`。
 */
export function packageNameFromArtifactUrl(source: string): string {
  const segments = artifactBasename(source).split("-");
  // 三元组：某段是已知架构、**且它前面还能切出版本**（避开包名里本就带架构词的假阳性）。
  const archAt = segments.findIndex(
    (segment, index) =>
      index > 0 &&
      KNOWN_ARCHES.includes(segment) &&
      segments.slice(0, index).some(looksLikeVersion),
  );
  const head = archAt >= 0 ? segments.slice(0, archAt) : segments;
  const versionAt = head.findIndex(looksLikeVersion);
  if (versionAt < 0) return "";
  return head.slice(0, versionAt).join("-").replace(/-+$/, "");
}

/**
 * 提交前预检：来源文件名能看出是别的组件 → 给出可读原因；对得上 / 读不出 → `null`。
 */
export function componentMismatchError(
  component: string,
  artifactUrl: string,
): string | null {
  const name = packageNameFromArtifactUrl(artifactUrl.trim());
  if (!name || name === component) return null;
  return `包名是 \`${name}\`，与本组件 \`${component}\` 不符：该发到 \`${name}\` 组件（改地址或换标签页）。`;
}
