import { Link } from "react-router-dom";
import { PageShell } from "./ui";
import { ManagedReleaseList } from "./ManagedReleaseList";
import { RELEASE_TARGETS } from "./packageTargets";
import styles from "./PackagePages.module.css";

/**
 * 安装包管理：中心托管的安装包**列表**（含平台 / 状态），可就地改托管状态。
 * 录入新包在独立页「安装包录入」（`/packages/add`）。
 */
export function PackageListPage() {
  return (
    <PageShell
      title="安装包管理"
      summary="中心托管的安装包一览：组件、版本、平台、状态与录入时间。录入新版本见「安装包录入」。"
    >
      <div className={styles.content}>
        <div className={`${styles.pageActions} ${styles.pageActionsEnd}`}>
          <Link className={styles.actionLink} to="/packages/add">
            安装包录入
          </Link>
        </div>
        <ManagedReleaseList targets={RELEASE_TARGETS} />
      </div>
    </PageShell>
  );
}
