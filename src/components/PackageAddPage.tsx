import { useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "./ui";
import { PackagePanel } from "./PackagePanel";
import { RELEASE_TARGETS } from "./packageTargets";
import pageStyles from "./PackagePages.module.css";
import styles from "./ReleaseWorkspace.module.css";

/**
 * 安装包录入：按组件录入来源（镜像制品）并查看该组件最近录入。
 * 已托管包一览与状态管理在独立页「安装包管理」（`/packages`）。
 */
export function PackageAddPage() {
  const [activeComponent, setActiveComponent] = useState(
    RELEASE_TARGETS[0].component,
  );
  const activeTarget =
    RELEASE_TARGETS.find((target) => target.component === activeComponent) ??
    RELEASE_TARGETS[0];

  return (
    <PageShell
      title="安装包录入"
      summary="按组件录入来源（镜像制品）：版本号自动从包地址解析，摘要必填。已托管包一览见「安装包管理」。"
    >
      <div className={pageStyles.content}>
        <div className={pageStyles.pageActions}>
          <Link className={pageStyles.backLink} to="/packages">
            ← 返回包列表
          </Link>
        </div>
      </div>
      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <h2 className={styles.workspaceTitle}>安装包</h2>
            <p className={styles.workspaceSubtitle}>
              一次只处理一个组件，减少误录入并让历史记录保持聚焦。
            </p>
          </div>
        </header>
        <div className={styles.tabs} role="tablist" aria-label="安装包组件">
          {RELEASE_TARGETS.map((target) => (
            <button
              key={target.component}
              type="button"
              role="tab"
              id={`package-tab-${target.component}`}
              aria-selected={target.component === activeTarget.component}
              aria-controls="package-panel"
              className={
                target.component === activeTarget.component
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              onClick={() => setActiveComponent(target.component)}
            >
              <strong>{target.name}</strong>
              <span>{target.tagline}</span>
            </button>
          ))}
        </div>
        <div
          id="package-panel"
          role="tabpanel"
          aria-labelledby={`package-tab-${activeTarget.component}`}
          className={styles.tabPanel}
        >
          <PackagePanel target={activeTarget} />
        </div>
      </section>
    </PageShell>
  );
}
