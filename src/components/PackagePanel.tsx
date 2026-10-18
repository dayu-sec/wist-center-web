import { useRef, useState, type FormEvent } from "react";
import {
  versionFromArtifactUrl,
  type ReleasePackage,
  type ResolvedGitHubRelease,
} from "../api";
import {
  isSidecarArtifact,
  pickSingleAsset,
  resolvedAssetsComponentError,
  validateArtifactRow,
  validateSingleArtifact,
} from "../packageForm";
import {
  usePublishRelease,
  usePublishReleaseBatch,
  useResolveCosPath,
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
  const [urlError, setUrlError] = useState<string | null>(null);
  const derivedVersion = versionFromArtifactUrl(artifactUrl);
  const formRef = useRef<HTMLFormElement>(null);

  /** 解析结果只取一个制品：先排掉边车 / 别的组件，再取第一个能用的。 */
  function handleResolved(result: ResolvedGitHubRelease): string | null {
    // 校验和 / 签名边车不是制品：既不该参与组件预检，也不该计入「共解析到 N 个」的提示。
    const candidates = result.assets.filter(
      (asset) => !isSidecarArtifact(asset.artifactUrl),
    );
    const wrongComponent = resolvedAssetsComponentError(
      target.component,
      candidates.map((asset) => asset.artifactUrl),
    );
    if (wrongComponent) return wrongComponent;

    const asset = pickSingleAsset(target.component, candidates);
    if (!asset) return `${result.version}：没有解析到可录入的制品。`;

    setArtifactUrl(asset.artifactUrl);
    setExpectedSha256(asset.sha256 ?? "");
    setUrlError(null);
    setShaError(null);

    const multiple =
      candidates.length > 1
        ? `（共解析到 ${candidates.length} 个制品，已取第一个；如需其它请手动替换地址。）`
        : "";
    // COS 只存 MD5（ETag），sha256 走对象自定义元数据：读不回时留空，提示手填。
    const shaHint = asset.sha256
      ? ""
      : " 缺 sha256（COS 元数据读不回），请用 `coscli stat` 读回手填。";
    return `已按 ${result.version} 填充 ${asset.name}。${multiple}${shaHint}`;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const artifact = artifactUrl.trim();
    const sha = expectedSha256.trim();
    // 提交前就地校验：组件不符优先于摘要格式（省一次注定 400 的往返）。
    const { url: urlProblem, sha: shaProblem } = validateSingleArtifact(
      target.component,
      artifact,
      sha,
    );
    setUrlError(urlProblem);
    if (urlProblem) return;
    if (shaProblem) {
      setShaError(shaProblem);
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
          setUrlError(null);
        },
      },
    );
  }

  const release = mutation.data?.data;

  return (
    <>
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.resolveBlock}>
          <ResolveSourceField onResolved={handleResolved} />
        </div>
        <FormField
          label="产物地址（artifact_url）"
          hint="版本号从包地址自动解析（文件名 / 包内目录名），不用手填。"
        >
          <TextInput
            name="artifactUrl"
            required
            value={artifactUrl}
            onChange={(event) => {
              setArtifactUrl(event.target.value);
              if (urlError) setUrlError(null);
            }}
            aria-invalid={urlError ? true : undefined}
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
        {urlError ? <ErrorBanner>{urlError}</ErrorBanner> : null}
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

/** 一键填充的解析来源：GitHub Release 页面地址 / COS 路径。 */
type ResolveSource = "github" | "cos";

/**
 * 两个录入表单共用的「一键解析」输入区：GitHub Release / COS 路径两个 tab。
 *
 * 解析接口**同形**，只有「结果怎么填」随表单不同 —— 那部分由 `onResolved` 处理，
 * 返回要显示在输入区下方的说明（`null` = 不显示）。抽成一处，避免两个表单的 tab、
 * 输入框与错误提示各写一遍后漂移。
 */
function ResolveSourceField({
  onResolved,
}: {
  onResolved: (result: ResolvedGitHubRelease) => string | null;
}) {
  const githubResolve = useResolveGitHubRelease();
  const cosResolve = useResolveCosPath();
  const [source, setSource] = useState<ResolveSource>("github");
  const [sourceInput, setSourceInput] = useState("");
  const [resolveNote, setResolveNote] = useState<string | null>(null);

  const resolve = source === "github" ? githubResolve : cosResolve;

  function handleResolve() {
    const value = sourceInput.trim();
    if (!value) return;
    resolve.mutate(value, {
      onSuccess: (result) => setResolveNote(onResolved(result)),
    });
  }

  return (
    <>
      <div className={styles.sourceTabs} role="tablist" aria-label="解析来源">
        {(["github", "cos"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={source === value}
            className={
              source === value
                ? `${styles.sourceTab} ${styles.sourceTabActive}`
                : styles.sourceTab
            }
            onClick={() => {
              setSource(value);
              setResolveNote(null);
            }}
          >
            {value === "github" ? "GitHub Release" : "COS 路径"}
          </button>
        ))}
      </div>
      <div className={styles.resolveField}>
        <span className={styles.resolveLabel}>
          {source === "github"
            ? "GitHub Release 地址（可选，一键填充）"
            : "COS 路径（可选，一键填充）"}
        </span>
        <div className={styles.resolveControls}>
          <TextInput
            value={sourceInput}
            onChange={(event) => {
              setSourceInput(event.target.value);
              if (resolveNote) setResolveNote(null);
            }}
            onKeyDown={(event) => {
              // 回车是「解析」，别把外面的发布表单提交掉。
              if (event.key === "Enter") {
                event.preventDefault();
                handleResolve();
              }
            }}
            placeholder={
              source === "github"
                ? "https://github.com/<owner>/<repo>/releases/tag/<tag>"
                : "桶/组件/版本，如 wist-1347593047/wist-gwlinkd/v0.9.3-alpha"
            }
          />
          <button
            type="button"
            className={styles.resolveButton}
            onClick={handleResolve}
            disabled={resolve.isPending || !sourceInput.trim()}
          >
            {resolve.isPending ? "解析中…" : "解析并填充"}
          </button>
        </div>
      </div>
      {resolve.error ? (
        <ErrorBanner>解析失败：{String(resolve.error)}</ErrorBanner>
      ) : null}
      {resolveNote ? <p className={styles.resolveNote}>{resolveNote}</p> : null}
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
  const blankRow = () => ({ artifactUrl: "", expectedSha256: "" });
  const [rows, setRows] = useState(platforms.map(blankRow));
  const [errors, setErrors] = useState<(string | null)[]>(
    platforms.map(() => null),
  );

  /** 解析结果按平台槽位自动填充地址与 sha256；返回给输入区的说明。 */
  function handleResolved(result: ResolvedGitHubRelease): string | null {
    const missing: string[] = [];
    const nextRows = rows.map((row, index) => {
      const slot = platforms[index];
      const asset = result.assets.find((item) => item.platform === slot.id);
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
    // 先按来源文件名看这批制品是不是别的组件 —— 当场说清，别等下载完批量提交才报。
    // 校验和 / 签名边车不是制品，也不参与组件预检。
    const wrongComponent = resolvedAssetsComponentError(
      target.component,
      result.assets
        .filter((asset) => !isSidecarArtifact(asset.artifactUrl))
        .map((asset) => asset.artifactUrl),
    );
    // COS 只存 MD5（ETag），sha256 走对象自定义元数据：读不回时留空，提示用 coscli stat 手填。
    const shaMissing = nextRows.some(
      (row) => row.artifactUrl && !row.expectedSha256,
    );
    return (
      wrongComponent ??
      (missing.length === 0
        ? `已按 ${result.version} 填充 ${platforms.length} 个平台。` +
          (shaMissing
            ? " 有平台缺 sha256（COS 元数据读不回），请用 `coscli stat` 读回手填。"
            : "")
        : `${result.version}：已填充 ${platforms.length - missing.length} 个平台，缺少 ${missing.join(
            " / ",
          )}，请手动补址。`)
    );
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
    // 三平台都必填、组件对得上、摘要格式正确，否则当场拦下（省一次注定 400 的往返）。
    const nextErrors = rows.map((row) =>
      validateArtifactRow(target.component, row),
    );
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
        <ResolveSourceField onResolved={handleResolved} />
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
