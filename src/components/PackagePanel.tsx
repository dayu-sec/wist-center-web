import { useRef, useState, type FormEvent } from "react";
import { versionFromArtifactUrl, type ReleasePackage } from "../api";
import { sha256Error } from "../sha256";
import {
  usePublishRelease,
  usePublishReleaseBatch,
  useResolveGitHubRelease,
  useReleases,
} from "../hooks";
import {
  Badge,
  ErrorBanner,
  FormField,
  PrimaryButton,
  ReceiptCard,
  SectionCard,
  TextInput,
  formatDateTime,
  platformLabel,
  releaseStatusLabel,
  releaseStatusTone,
} from "./ui";
import styles from "./PackagePanel.module.css";

/** 多平台组件的一个平台槽位（`id` 为完整 target-triple，与后端解析出的一致）。 */
export interface PlatformSlot {
  id: string;
  label: string;
  hint: string;
}

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
  /** 多平台组件：一次录入必须按这些槽位齐备（wist-agentd / galaxy-ops / galaxy-flow 三平台）。 */
  platforms?: PlatformSlot[];
}

/** 提交某个组件的新版本（录入/镜像），并在同一工作区查看该组件最近的托管记录。 */
export function PackagePanel({ target }: { target: PackageTarget }) {
  const { data: releasesData } = useReleases(target.component);
  const releases = releasesData?.data ?? [];
  const platforms = target.platforms ?? [];

  return (
    <SectionCard title={`提交 ${target.name} 新版本`} subtitle={target.subtitle}>
      {platforms.length > 0 ? (
        <VariantsForm target={target} platforms={platforms} />
      ) : (
        <SingleArtifactForm target={target} />
      )}
      <HistorySection target={target} releases={releases} />
    </SectionCard>
  );
}

/** 单制品组件的录入表单（一次一个包）。 */
function SingleArtifactForm({ target }: { target: PackageTarget }) {
  const mutation = usePublishRelease(target.component);
  // 受控，用于实时预览「会记哪个版本」（真值以提交回执为准）。
  const [artifactUrl, setArtifactUrl] = useState("");
  const [expectedSha256, setExpectedSha256] = useState("");
  const [shaError, setShaError] = useState<string | null>(null);
  const derivedVersion = versionFromArtifactUrl(artifactUrl);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const artifact = artifactUrl.trim();
    const sha = expectedSha256.trim();
    // 摘要是**必填**：提交前先拦一道，省一次注定 400 的往返，并当场说清哪里不对。
    const error = sha256Error(sha);
    if (error) {
      setShaError(error);
      return;
    }
    setShaError(null);
    mutation.mutate(
      {
        artifactUrl: artifact,
        expectedSha256: sha,
        // 当前管理端没有独立发布者字段，沿用默认管理身份满足后端审计契约。
        requestedBy: "admin",
      },
      {
        onSuccess: () => {
          // 提交成功后清空表单，避免把上一次的地址 / 摘要再交一遍（回执仍留在下方）。
          formRef.current?.reset();
          setArtifactUrl("");
          setExpectedSha256("");
          setShaError(null);
        },
      },
    );
  }

  const release = mutation.data?.data;

  return (
    <>
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
          label="期望摘要（sha256，必填）"
          hint="填发布侧 *.sha256 里那串 64 位十六进制（可带 sha256: 前缀）；中心拿块字节核对，不符即拒。"
        >
          <TextInput
            name="expectedSha256"
            required
            value={expectedSha256}
            onChange={(event) => {
              setExpectedSha256(event.target.value);
              if (shaError) setShaError(null);
            }}
            aria-invalid={shaError ? true : undefined}
            placeholder="例如：3f9a1c0d…（64 位十六进制，可带 sha256: 前缀）"
          />
        </FormField>
        {shaError ? <ErrorBanner>{shaError}</ErrorBanner> : null}
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
      {release ? <ReleaseReceipt release={release} /> : null}
    </>
  );
}

/**
 * 多平台组件的录入表单：按槽位各填一个制品，**一次提交三平台**（同一版本）。
 * 缺任何一个都会被中心整体拒绝（不落任何记录）。
 */
function VariantsForm({
  target,
  platforms,
}: {
  target: PackageTarget;
  platforms: PlatformSlot[];
}) {
  const mutation = usePublishReleaseBatch(target.component);
  const resolve = useResolveGitHubRelease();
  const blankRow = () => ({ artifactUrl: "", expectedSha256: "" });
  const [rows, setRows] = useState(platforms.map(blankRow));
  const [errors, setErrors] = useState<(string | null)[]>(
    platforms.map(() => null),
  );
  const [releaseUrl, setReleaseUrl] = useState("");
  const [resolveNote, setResolveNote] = useState<string | null>(null);

  /** 解析 GitHub Release 地址 → 按平台槽位自动填充地址与 sha256。 */
  function handleResolve() {
    const url = releaseUrl.trim();
    if (!url) return;
    resolve.mutate(url, {
      onSuccess: (result) => {
        const missing: string[] = [];
        const nextRows = rows.map((row, index) => {
          const slot = platforms[index];
          const asset = result.assets.find(
            (item) => item.platform === slot.id,
          );
          if (!asset) {
            missing.push(slot.label);
            return row;
          }
          return {
            artifactUrl: asset.artifactUrl,
            expectedSha256: asset.sha256 ?? "",
          };
        });
        setRows(nextRows);
        setErrors(platforms.map(() => null));
        setResolveNote(
          missing.length === 0
            ? `已按 ${result.version} 填充 ${platforms.length} 个平台。`
            : `${result.version}：已填充 ${platforms.length - missing.length} 个平台，缺少 ${missing.join(
                " / ",
              )}，请手动补址。`,
        );
      },
    });
  }

  function updateRow(
    index: number,
    patch: Partial<{ artifactUrl: string; expectedSha256: string }>,
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function setRowError(index: number, message: string | null) {
    setErrors((current) =>
      current.map((value, i) => (i === index ? message : value)),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 三平台都必填且摘要格式正确，否则当场拦下（省一次注定 400 的往返）。
    const nextErrors = platforms.map((_, index) => {
      const row = rows[index];
      if (!row.artifactUrl.trim()) return "请填写该平台的产物地址。";
      return sha256Error(row.expectedSha256.trim());
    });
    if (nextErrors.some((message) => message)) {
      setErrors(nextErrors);
      return;
    }
    setErrors(platforms.map(() => null));
    mutation.mutate(
      {
        requestedBy: "admin",
        artifacts: rows.map((row) => ({
          artifactUrl: row.artifactUrl.trim(),
          expectedSha256: row.expectedSha256.trim(),
        })),
      },
      {
        onSuccess: () => {
          setRows(platforms.map(blankRow));
          setErrors(platforms.map(() => null));
        },
      },
    );
  }

  const release = mutation.data?.data;

  return (
    <>
      <form className={styles.variants} onSubmit={handleSubmit}>
        <p className={styles.variantsHint}>
          该组件为多平台：一次必须录入{" "}
          <strong>macOS-ARM / Linux-x86_64-musl / Linux-ARM64-musl</strong>{" "}
          三个制品（同一版本）。全部校验通过才会落库。
        </p>
        <div className={styles.resolveField}>
          <span className={styles.resolveLabel}>
            GitHub Release 地址（可选，一键填充）
          </span>
          <div className={styles.resolveControls}>
            <TextInput
              value={releaseUrl}
              onChange={(event) => {
                setReleaseUrl(event.target.value);
                if (resolveNote) setResolveNote(null);
              }}
              placeholder="https://github.com/<owner>/<repo>/releases/tag/<tag>"
            />
            <button
              type="button"
              className={styles.resolveButton}
              onClick={handleResolve}
              disabled={resolve.isPending || !releaseUrl.trim()}
            >
              {resolve.isPending ? "解析中…" : "解析并填充"}
            </button>
          </div>
        </div>
        {resolve.error ? (
          <ErrorBanner>解析失败：{String(resolve.error)}</ErrorBanner>
        ) : null}
        {resolveNote ? (
          <p className={styles.resolveNote}>{resolveNote}</p>
        ) : null}
        {platforms.map((slot, index) => {
          const row = rows[index];
          const derivedVersion = versionFromArtifactUrl(row.artifactUrl);
          return (
            <div className={styles.variantRow} key={slot.id}>
              <div className={styles.variantSlot}>
                <strong>{slot.label}</strong>
                <span>{slot.hint}</span>
              </div>
              <FormField
                label="产物地址（artifact_url）"
                hint={
                  derivedVersion
                    ? `将录入版本 ${derivedVersion}`
                    : "版本号从包地址自动解析。"
                }
              >
                <TextInput
                  required
                  value={row.artifactUrl}
                  onChange={(event) => {
                    updateRow(index, { artifactUrl: event.target.value });
                    if (errors[index]) setRowError(index, null);
                  }}
                  placeholder={target.artifactPlaceholder}
                />
              </FormField>
              <FormField label="期望摘要（sha256，必填）">
                <TextInput
                  required
                  value={row.expectedSha256}
                  onChange={(event) => {
                    updateRow(index, { expectedSha256: event.target.value });
                    if (errors[index]) setRowError(index, null);
                  }}
                  aria-invalid={errors[index] ? true : undefined}
                  placeholder="64 位十六进制，可带 sha256: 前缀"
                />
              </FormField>
              {errors[index] ? (
                <div className={styles.variantError}>
                  <ErrorBanner>{errors[index]}</ErrorBanner>
                </div>
              ) : null}
            </div>
          );
        })}
        <div className={styles.formAction}>
          <span className={styles.actionHint}>
            三平台齐备后一次提交；缺任何一个都会被拒。
          </span>
          <PrimaryButton type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "提交中…" : "提交三平台"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>批量提交失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {release ? (
        <div className={styles.variantsReceipts}>
          <ReleaseReceipt release={release} />
        </div>
      ) : null}
    </>
  );
}

/** 一次录入回执：一个安装包（版本 + 多平台制品）。 */
function ReleaseReceipt({ release }: { release: ReleasePackage }) {
  return (
    <ReceiptCard
      title="本次提交回执"
      fields={[
        ["版本", release.version],
        ["状态", releaseStatusLabel(release.status)],
        ["制品数", String(release.artifacts.length)],
        [
          "制品",
          <ul className={styles.receiptArtifacts}>
            {release.artifacts.map((artifact, index) => (
              <li key={`${artifact.platform ?? "none"}/${index}`}>
                <code className={styles.historyPlatform}>
                  {platformLabel(artifact.platform)}
                </code>{" "}
                <a
                  className={styles.artifactLink}
                  href={artifact.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  {artifact.source}
                </a>
              </li>
            ))}
          </ul>,
        ],
        ["提交时间", formatDateTime(release.publishedAt)],
      ]}
    />
  );
}

/** 该组件最近的托管安装包（一个版本 = 一个包，含多平台制品）。 */
function HistorySection({
  target,
  releases,
}: {
  target: PackageTarget;
  releases: ReleasePackage[];
}) {
  return (
    <div className={styles.history}>
      <div className={styles.historyHeader}>
        <h3 className={styles.historyTitle}>最近录入</h3>
        <span className={styles.historyHint}>{target.name}</span>
      </div>
      {releases.length === 0 ? (
        <div className={styles.historyEmpty}>暂无录入记录。</div>
      ) : (
        <div className={styles.historyList}>
          {releases.map((record, index) => (
            <div
              key={`${record.version}/${index}`}
              className={styles.historyItem}
            >
              <strong className={styles.historyVersion}>{record.version}</strong>
              <div className={styles.historyArtifacts}>
                {record.artifacts.length === 0 ? (
                  <span className={styles.historyArtifactEmpty}>
                    {platformLabel(null)}（无平台制品）
                  </span>
                ) : (
                  record.artifacts.map((artifact, artifactIndex) => (
                    <div
                      key={`${artifact.platform ?? "none"}/${artifactIndex}`}
                      className={styles.historyArtifact}
                    >
                      <code className={styles.historyPlatform}>
                        {platformLabel(artifact.platform)}
                      </code>
                      <a
                        className={styles.artifactLink}
                        href={artifact.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artifact.source}
                      </a>
                    </div>
                  ))
                )}
              </div>
              <span className={styles.historyMeta}>
                <Badge tone={releaseStatusTone(record.status)}>
                  {releaseStatusLabel(record.status)}
                </Badge>
                {formatDateTime(record.publishedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
