import { useAllReleases, useSetReleaseStatus } from "../hooks";
import type { PackageTarget } from "./PackagePanel";
import {
  Badge,
  ErrorBanner,
  ExampleTag,
  LoadingDots,
  SectionCard,
  formatDateTime,
  platformLabel,
  releaseStatusLabel,
  releaseStatusTone,
} from "./ui";
import styles from "./ManagedReleaseList.module.css";

/**
 * 汇总展示**所有组件**已托管的安装包：组件 / 版本 / 平台 / 状态 / 录入时间，
 * 并可就地把某版本标记为「已过期」或恢复「在用」。录入新版本见下方各组件工作区。
 */
export function ManagedReleaseList({
  targets,
}: {
  targets: readonly PackageTarget[];
}) {
  const components = targets.map((target) => target.component);
  const nameByComponent = new Map(
    targets.map((target) => [target.component, target.name]),
  );
  const { data, isLoading, source } = useAllReleases(components);
  const setStatus = useSetReleaseStatus();

  const activeCount = data.filter((record) => record.status !== "expired").length;

  return (
    <SectionCard
      title="已托管包"
      subtitle={`共 ${data.length} 个包，在用 ${activeCount} 个。`}
    >
      {isLoading && data.length === 0 ? (
        <LoadingDots />
      ) : data.length === 0 ? (
        <div className={styles.empty}>
          还没有录入任何安装包。去「安装包录入」录入第一个。
        </div>
      ) : (
        <div className={styles.list}>
          <div className={styles.headerRow} aria-hidden="true">
            <span>组件</span>
            <span>版本</span>
            <span>平台</span>
            <span>状态</span>
            <span>录入时间</span>
            <span>操作</span>
          </div>
          {data.map((record, index) => {
            const expired = record.status === "expired";
            const pending =
              setStatus.isPending &&
              setStatus.variables?.component === record.component &&
              setStatus.variables?.version === record.version;
            return (
              <div
                key={`${record.component}/${record.version}/${index}`}
                className={styles.row}
              >
                <strong className={styles.component}>
                  {nameByComponent.get(record.component) ?? record.component}
                </strong>
                <span className={styles.version}>{record.version}</span>
                <span className={styles.platform}>
                  {record.artifacts.length === 0 ? (
                    <span className={styles.platformChip}>
                      {platformLabel(null)}
                    </span>
                  ) : (
                    record.artifacts.map((artifact, artifactIndex) => (
                      <span
                        key={`${artifact.platform ?? "none"}/${artifactIndex}`}
                        className={styles.platformChip}
                      >
                        {platformLabel(artifact.platform)}
                      </span>
                    ))
                  )}
                </span>
                <span className={styles.status}>
                  <Badge tone={releaseStatusTone(record.status)}>
                    {releaseStatusLabel(record.status)}
                  </Badge>
                  {record.source === "example" ? <ExampleTag /> : null}
                </span>
                <span className={styles.time}>
                  {formatDateTime(record.publishedAt)}
                </span>
                <span className={styles.action}>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${
                      expired ? styles.actionButtonRestore : ""
                    }`}
                    disabled={pending}
                    onClick={() =>
                      setStatus.mutate({
                        component: record.component,
                        version: record.version,
                        status: expired ? "published" : "expired",
                      })
                    }
                  >
                    {pending ? "处理中…" : expired ? "恢复在用" : "标记过期"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {setStatus.error ? (
        <ErrorBanner>改状态失败：{String(setStatus.error)}</ErrorBanner>
      ) : null}
      {source === "example" ? (
        <p className={styles.note}>
          当前为示例数据（未配置中心 Token 或接口不可达），改状态不会生效。
        </p>
      ) : null}
    </SectionCard>
  );
}
