import styles from "./AdminTokenRequired.module.css";

/**
 * 无有效 Admin Token 时的内容区空态。
 *
 * 为什么要有它：管理接口在没有（或拿错）token 时一律 401，而取数层过去会把 401 也回落成
 * **内置示例数据** —— 页面因此显示一大堆「假网关/假数据」，很容易被当成真的。这里在内容区
 * 直接拦掉：没 token / token 被拒就不渲染任何数据页，只提示去左侧填令牌。
 */
export function AdminTokenRequired({ hasToken }: { hasToken: boolean }) {
  return (
    <div className={styles.panel} role="status">
      <span className={styles.badge}>需要鉴权</span>
      <h2 className={styles.title}>
        {hasToken ? "Admin Token 无效或已过期" : "未设置 Admin Token"}
      </h2>
      <p className={styles.hint}>
        {hasToken
          ? "左侧「Admin Token」里的令牌被中心拒绝（401）。请重新填入正确令牌并点「应用」—— 应用后会重新拉取。"
          : "在左侧「Admin Token」粘贴管理令牌并点「应用」，即可查看网关与发布数据。"}
      </p>
    </div>
  );
}
