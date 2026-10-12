import { Outlet } from "react-router-dom";
import { useAdminToken, useAuthErrorSignal } from "../hooks";
import { AdminTokenRequired } from "./AdminTokenRequired";
import { AppStatusBar } from "./AppStatusBar";
import { GlobalTopNavigation } from "./GlobalTopNavigation";
import styles from "./AppLayout.module.css";

/**
 * 应用级外壳：左侧深色侧边栏（导航 + Admin Token）+ 右侧内容区。
 * 内容区顶部常驻全局状态条（面包屑 / 轮询状态 / 手动刷新），
 * 各页面通过子路由渲染进 <Outlet />。
 *
 * 内容区经过一道鉴权 gate：无 token（或 token 被中心拒绝）时不渲染任何数据页 —— 免得展示
 * 「示例数据」被当成真的。侧边栏照常显示，好让人去填令牌。
 */
export function AppLayout() {
  const token = useAdminToken();
  const authError = useAuthErrorSignal();
  const blocked = !token || authError;
  return (
    <div className={styles.shell}>
      <GlobalTopNavigation />
      <div className={styles.body}>
        <AppStatusBar />
        <main className={styles.main}>
          {blocked ? (
            <AdminTokenRequired hasToken={Boolean(token)} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
