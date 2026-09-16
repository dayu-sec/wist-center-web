import { Outlet } from "react-router-dom";
import { AppStatusBar } from "./AppStatusBar";
import { GlobalTopNavigation } from "./GlobalTopNavigation";
import styles from "./AppLayout.module.css";

/**
 * 应用级外壳：左侧深色侧边栏（导航 + Admin Token）+ 右侧内容区。
 * 内容区顶部常驻全局状态条（面包屑 / 轮询状态 / 手动刷新），
 * 各页面通过子路由渲染进 <Outlet />。
 */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <GlobalTopNavigation />
      <div className={styles.body}>
        <AppStatusBar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
