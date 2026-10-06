import { useRef, useState, type FormEvent } from "react";
import { versionFromArtifactUrl } from "../api";
import { usePublishRelease, useReleases } from "../hooks";
import {
  Badge,
  ErrorBanner,
  FormField,
  PrimaryButton,
  ReceiptCard,
  SectionCard,
  TextInput,
  formatDateTime,
} from "./ui";
import styles from "./PackagePanel.module.css";

/** 一个安装包组件的展示元信息；`component` 即后端 `/api/v1/admin/releases/:component` 的路径段。 */
export interface PackageTarget {
  component: string;
  /** 展示名（如 `WarpGateWay` / `galaxy-ops`）。 */
  name: string;
  /** 标签页里的短说明。 */
  tagline: string;
  /** 卡片副标题。 */
  subtitle: string;
  /** 产物地址输入框的占位示例。 */
  artifactPlaceholder: string;
}

/** 托管记录状态文案：后端 `published` → 「已录入」（这一页是包管理，不用「发布」口径）。 */
function releaseStatusLabel(status: string): string {
  return status === "published" ? "已录入" : status;
}

/** 提交某个组件的新版本（录入/镜像），并在同一工作区查看该组件最近的托管记录。 */
export function PackagePanel({ target }: { target: PackageTarget }) {
  const mutation = usePublishRelease(target.component);
  const { data: releasesData } = useReleases(target.component);
  const releases = releasesData?.data ?? [];
  // 受控，用于实时预览「会记哪个版本」（真值以提交回执为准）。
  const [artifactUrl, setArtifactUrl] = useState("");
  const derivedVersion = versionFromArtifactUrl(artifactUrl);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate(
      {
        artifactUrl: String(data.get("artifactUrl") ?? ""),
        expectedSha256: String(data.get("expectedSha256") ?? ""),
        // 当前管理端没有独立发布者字段，沿用默认管理身份满足后端审计契约。
        requestedBy: "admin",
      },
      {
        onSuccess: () => {
          // 提交成功后清空表单，避免把上一次的地址 / 摘要再交一遍（回执仍留在下方）。
          formRef.current?.reset();
          setArtifactUrl("");
        },
      },
    );
  }

  const release = mutation.data?.data;

  return (
    <SectionCard
      title={`提交 ${target.name} 新版本`}
      subtitle={target.subtitle}
    >
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
        <FormField
          label="产物地址（artifact_url）"
          hint="版本号从包地址自动解析（文件名 / 包内目录名），不用手填。"
        >
          <TextInput
            name="artifactUrl"
            required
            value={artifactUrl}
            onChange={(event) => setArtifactUrl(event.target.value)}
            placeholder={target.artifactPlaceholder}
          />
        </FormField>
        <FormField
          label="期望摘要（可选）"
          hint="sha256：核对读到的制品字节，不符即拒；留空则只记录算出的摘要。"
        >
          <TextInput
            name="expectedSha256"
            placeholder="例如：3f9a1c0d…（可带 sha256: 前缀）"
          />
        </FormField>
        <div className={styles.formAction}>
          <span className={styles.actionHint}>
            {derivedVersion
              ? `将录入版本 ${derivedVersion}`
              : "提交后进入托管记录。"}
          </span>
          <PrimaryButton type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "提交中…" : "提交"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>提交失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {release ? (
        <ReceiptCard
          title="本次提交回执"
          fields={[
            ["版本", release.version],
            ["状态", releaseStatusLabel(release.status)],
            ["产物地址", release.artifactUrl],
            ["提交时间", formatDateTime(release.publishedAt)],
          ]}
        />
      ) : null}
      <div className={styles.history}>
        <div className={styles.historyHeader}>
          <h3 className={styles.historyTitle}>最近录入</h3>
          <span className={styles.historyHint}>{target.name}</span>
        </div>
        {releases.length === 0 ? (
          <div className={styles.historyEmpty}>暂无录入记录。</div>
        ) : (
          <div className={styles.historyList}>
            {releases.map((record) => (
              <div key={record.version} className={styles.historyItem}>
                <strong className={styles.historyVersion}>
                  {record.version}
                </strong>
                <a
                  className={styles.artifactLink}
                  href={record.artifactUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {record.artifactUrl}
                </a>
                <span className={styles.historyMeta}>
                  <Badge
                    tone={record.status === "published" ? "green" : "gray"}
                  >
                    {releaseStatusLabel(record.status)}
                  </Badge>
                  {formatDateTime(record.publishedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
