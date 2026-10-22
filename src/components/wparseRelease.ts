import type { WparseTag } from "../api";

/**
 * 规则 / 配置发布入口的纯口径（不引 React，供页面与契约测试共用）。
 *
 * tag 候选由服务端按 semver 降序排好；页面只做“默认选最新”和本地形状校验，
 * 真正的存在性校验仍在服务端（`GET tags/{tag}`）。
 */

/** 默认选最新 tag；没有候选 → 空串。 */
export function defaultWparseTag(tags: readonly WparseTag[]): string {
  return tags[0]?.tag ?? "";
}

/** 与服务端 `valid_release_tag` 同一口径：`^[A-Za-z0-9._-]{1,64}$`。 */
export function validWparseTag(tag: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(tag.trim());
}

/** tag 的短展示（commit 缺失 → `—`）。 */
export function shortWparseCommit(commit: string | null | undefined): string {
  if (!commit) return "—";
  return commit.slice(0, 12);
}
