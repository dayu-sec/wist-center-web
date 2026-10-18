import type { PackageSourceView } from "../api";

/**
 * 把「版本号 + 配置里的来源位置」拼成解析接口要的地址。
 *
 * - GitHub：`https://github.com/<owner>/<repo>/releases/tag/<version>`；
 * - COS：配了 region 就用虚拟主机地址（解析器能从 host 读出 region，省掉逐区探测），
 *   否则用 `<bucket>/<prefix>/<version>` 让解析器自己试。
 *
 * 配置缺项 / 版本为空 → 空串（页面据此禁用「检查 URL」）。纯函数，便于契约测试。
 */
export function composePackageSourceUrl(
  source: PackageSourceView | undefined,
  kind: "github" | "cos",
  version: string,
): string {
  const tag = version.trim();
  if (!source || !tag) return "";
  if (kind === "github") {
    return source.githubRepo
      ? `https://github.com/${source.githubRepo}/releases/tag/${tag}`
      : "";
  }
  if (!source.cosBucket || !source.cosPrefix) return "";
  return source.cosRegion
    ? `https://${source.cosBucket}.cos.${source.cosRegion}.myqcloud.com/${source.cosPrefix}/${tag}`
    : `${source.cosBucket}/${source.cosPrefix}/${tag}`;
}
