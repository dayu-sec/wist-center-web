import { useState } from "react";
import { PageShell } from "./ui";
import { PackagePanel, type PackageTarget } from "./PackagePanel";
import styles from "./ReleaseWorkspace.module.css";

/**
 * 中心**托管**的安装包目录（`component` 即后端 `:component` 路径段）：
 * agentd 包 / gateway-stack 包 / galaxy-ops 包 / galaxy-flow 包。
 *
 * 这一页只管「包本身」：录入来源（镜像制品）、看当前与历史。
 * 把包装出去（升级安装 / 下发给网关）见「发布」页。
 */
const RELEASE_TARGETS: PackageTarget[] = [
  {
    component: "wist-gateway-stack",
    name: "WarpGateWay",
    tagline: "网关运行时",
    subtitle: "网关运行时安装包（gateway-stack 部署包），供 Gateway 实例升级。",
    artifactPlaceholder:
      "https://artifacts.example.com/wist-gateway-stack/v3.1.0.tar.gz",
  },
  {
    component: "wist-agentd",
    name: "WistAgentd",
    tagline: "Agent 服务",
    subtitle: "Agent 服务安装包，供各 WarpGateWay 实例拉取。",
    artifactPlaceholder: "https://artifacts.example.com/wist-agentd/v2.4.1",
  },
  {
    component: "galaxy-ops",
    name: "galaxy-ops",
    tagline: "部署工具",
    subtitle:
      "galaxy-ops 部署工具包（网关执行器 `gops prj upgrade` 依赖）。",
    artifactPlaceholder:
      "https://artifacts.example.com/galaxy-ops/v0.18.2-aarch64-apple-darwin.tar.gz",
  },
  {
    component: "galaxy-flow",
    name: "galaxy-flow",
    tagline: "工作流工具",
    subtitle: "galaxy-flow 工作流工具包。",
    artifactPlaceholder:
      "https://artifacts.example.com/galaxy-flow/v0.15.1-aarch64-apple-darwin.tar.gz",
  },
];

/** 包管理：录入/镜像各组件安装包，查看当前与历史托管记录。 */
export function PackagePage() {
  const [activeComponent, setActiveComponent] = useState(
    RELEASE_TARGETS[0].component,
  );
  const activeTarget =
    RELEASE_TARGETS.find((target) => target.component === activeComponent) ??
    RELEASE_TARGETS[0];

  return (
    <PageShell
      title="包管理"
      summary="管理中心托管的安装包：录入来源（镜像制品）、查看各组件当前版本与历史。把包装出去见「发布」。"
    >
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
