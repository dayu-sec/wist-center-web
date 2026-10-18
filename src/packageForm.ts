import type { ResolvedGitHubAsset } from "./api";
import { componentMismatchError } from "./artifactName";
import { sha256Error } from "./sha256";

/**
 * 录入表单（`PackagePanel`）「提交前」校验的**纯逻辑**，从 React 组件里抽出来以便测试。
 *
 * 顺序与界面一致：
 * - 单制品：**组件不符优先于摘要格式** —— 组件都错了，没必要再纠摘要；
 * - 多平台：逐行「空地址 → 组件不符 → 摘要格式」，返回该行首个问题。
 */

/** 多平台表单里的一行（与提交体一致）。 */
export interface ArtifactRow {
  artifactUrl: string;
  expectedSha256: string;
}

/**
 * 单制品表单的提交前校验。`url` 命中即代表表单应就地拦下、不再看 `sha`。
 */
export function validateSingleArtifact(
  component: string,
  artifactUrl: string,
  expectedSha256: string,
): { url: string | null; sha: string | null } {
  return {
    url: componentMismatchError(component, artifactUrl),
    sha: sha256Error(expectedSha256.trim()),
  };
}

/** 多平台表单**一行**的提交前校验：返回首个问题，全部通过返回 `null`。 */
export function validateArtifactRow(
  component: string,
  row: ArtifactRow,
): string | null {
  if (!row.artifactUrl.trim()) return "请填写该平台的产物地址。";
  const mismatch = componentMismatchError(component, row.artifactUrl);
  if (mismatch) return mismatch;
  return sha256Error(row.expectedSha256.trim());
}

/**
 * 同一 Release 常把校验和 / 签名边车与制品并列（`.sha256` / `.sig` …）：
 * 它们不是可录入的制品，单制品选件时要跳过。
 */
export function isSidecarArtifact(artifactUrl: string): boolean {
  const file = (artifactUrl.split(/[?#]/)[0].split("/").pop() ?? "").toLowerCase();
  return [".sha256", ".sha512", ".sha1", ".md5", ".sig", ".asc"].some(
    (suffix) => file.endsWith(suffix),
  );
}

/**
 * 单制品表单的「一键填充」选件规则：先排除边车文件（`.sha256` 等）与文件名明确属于别的
 * 组件的制品，取第一个能用的；读不出包名的一律放行（解析器已按平台/命名筛过）。
 *
 * 返回 `null` = 这批制品里没有能填的（调用方应先看 `resolvedAssetsComponentError`，
 * 把「这是别的组件」说清楚）。
 */
export function pickSingleAsset(
  component: string,
  assets: readonly ResolvedGitHubAsset[],
): ResolvedGitHubAsset | null {
  for (const asset of assets) {
    if (isSidecarArtifact(asset.artifactUrl)) continue;
    if (componentMismatchError(component, asset.artifactUrl) === null) {
      return asset;
    }
  }
  return null;
}

/**
 * 「一键解析 GitHub Release」填充后，整批制品的组件预检：返回第一个「组件不符」的原因
 * （读不出包名的一律放行），无则 `null`。
 */
export function resolvedAssetsComponentError(
  component: string,
  artifactUrls: readonly string[],
): string | null {
  for (const artifactUrl of artifactUrls) {
    const message = componentMismatchError(component, artifactUrl);
    if (message) return message;
  }
  return null;
}
