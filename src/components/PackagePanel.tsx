import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  versionFromArtifactUrl,
  type ReleaseDownloadJob,
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
  CompatibilityBadge,
  CompatibilityDetail,
} from "./Compatibility";
import { compatSummary } from "./compatReport";
import {
  useCancelJob,
  usePackageLatest,
  usePackageSources,
  usePublishRelease,
  usePublishReleaseBatch,
  useReleaseJob,
  useReleaseJobs,
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
import { composePackageSourceUrl } from "./packageSourceUrl";
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

/** `legacy-` 前缀的任务 id 是新前端给旧中心同步回执的占位，不可查。 */
const LEGACY_JOB_PREFIX = "legacy-";
const LAST_RELEASE_JOB_KEY = "wistCenterWeb.lastReleaseJob.";

/** 刷新页面后恢复「本组件最近一次提交」的任务 id（会话级，关页即清）。 */
function readLastReleaseJob(component: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(`${LAST_RELEASE_JOB_KEY}${component}`);
  } catch {
    return null;
  }
}

function rememberLastReleaseJob(component: string, jobId: string): void {
  if (typeof window === "undefined" || jobId.startsWith(LEGACY_JOB_PREFIX)) {
    return;
  }
  try {
    window.sessionStorage.setItem(`${LAST_RELEASE_JOB_KEY}${component}`, jobId);
  } catch {
    // 会话存储不可用时只影响「刷新后回显」，不影响本次提交。
  }
}

/** 旧中心同步回执的占位 id 不能拿去查任务。 */
function trackableJobId(jobId: string | null): string | null {
  return jobId && !jobId.startsWith(LEGACY_JOB_PREFIX) ? jobId : null;
}

/** 提交某个组件的新版本（录入/镜像），并在同一工作区查看该组件最近的托管记录。 */
export function PackagePanel({ target }: { target: PackageTarget }) {
  const { data: releasesData } = useReleases(target.component);
  const releases = releasesData?.data ?? [];
  // 远程包下载任务（新→旧）：有排队 / 执行中时 2s 轮询，到终态就停。
  const jobs = useReleaseJobs(target.component).data ?? [];
  const platforms = target.platforms ?? [];
  // 录入页的版本输入默认填「该组件最近录入的版本」：操作者只需把它往上改一格。
  const latestVersion = releases[0]?.version;

  return (
    <SectionCard
      title={`提交 ${target.name} 新版本`}
      subtitle={target.subtitle}
    >
      {platforms.length > 0 ? (
        <VariantsForm
          target={target}
          platforms={platforms}
          latestVersion={latestVersion}
        />
      ) : (
        <SingleArtifactForm target={target} latestVersion={latestVersion} />
      )}
      <DownloadJobsSection jobs={jobs} />
      <HistorySection target={target} releases={releases} />
    </SectionCard>
  );
}

/** 单制品组件的录入表单（一次一个包）。 */
function SingleArtifactForm({
  target,
  latestVersion,
}: {
  target: PackageTarget;
  latestVersion?: string;
}) {
  const mutation = usePublishRelease(target.component);
  const queryClient = useQueryClient();
  // 本表单最近一次提交的任务 id：按 id 单独轮询（不依赖「最近 N 条」列表）；
  // 刷新页面时从会话存储恢复，反馈不会因为一次刷新就丢。
  const [jobId, setJobId] = useState<string | null>(() =>
    readLastReleaseJob(target.component),
  );
  const trackedJobId = trackableJobId(jobId);
  const jobQuery = useReleaseJob(trackedJobId);
  const job = jobQuery.data ?? mutation.data?.data ?? null;
  // 任务成功后刷新「最近录入」；每个任务只刷一次。
  const refreshedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.state !== "succeeded" || job.jobId === refreshedJob.current)
      return;
    refreshedJob.current = job.jobId;
    void queryClient.invalidateQueries({
      queryKey: ["releases", target.component],
    });
  }, [job, queryClient, target.component]);
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
        onSuccess: (result) => {
          // 只入队；进度按 job id 单独轮询，并记进会话存储供刷新后回显。
          setJobId(result.data.jobId);
          rememberLastReleaseJob(target.component, result.data.jobId);
          // 提交成功后清空表单，避免把上一次的地址 / 摘要再交一遍。
          formRef.current?.reset();
          setArtifactUrl("");
          setExpectedSha256("");
          setShaError(null);
          setUrlError(null);
        },
      },
    );
  }

  return (
    <>
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.resolveBlock}>
          <ResolveSourceField
            component={target.component}
            latestVersion={latestVersion}
            onResolved={handleResolved}
          />
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
            {mutation.isPending ? "入队中…" : "提交"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>提交失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {jobQuery.isError && jobId ? (
        <ErrorBanner>
          任务反馈暂时取不到（正在自动重试）：{String(jobQuery.error)}
        </ErrorBanner>
      ) : null}
      {trackedJobId && jobQuery.isPending && !job ? (
        <p className={styles.jobHint}>正在读取任务反馈…</p>
      ) : null}
      {job ? <ReleaseJobStatus job={job} /> : null}
      {job?.state === "succeeded" && job.package ? (
        <ReleaseReceipt release={job.package} />
      ) : null}
      {job?.state === "failed" ? (
        <ErrorBanner>
          下载 / 录入失败：{job.errorDetail ?? job.errorCode ?? "未知原因"}
        </ErrorBanner>
      ) : null}
    </>
  );
}

/** 一键填充的解析来源：GitHub Release 页面地址 / COS 路径。 */
type ResolveSource = "github" | "cos";

/**
 * 两个录入表单共用的「自动探测最新版本」输入区。
 *
 * 配置了 `[[packages.sources]]` 后，页面**不再要求每次填版本号**：
 * 挂载时用「最近录入的版本」作基准，自动探测最新（GitHub 列 releases；只有 COS 时从基准往后试），
 * 探到新版本就直接填表；第一次没有基准时由 GitHub 给出最新，COS-only 环境才退回手填版本号。
 *
 * 仍保留两种手动兜底：指定版本号 / 直接粘贴完整地址（配置里没有的组件自动走后者）。
 */
function ResolveSourceField({
  component,
  latestVersion,
  onResolved,
}: {
  component: string;
  latestVersion?: string;
  onResolved: (result: ResolvedGitHubRelease) => string | null;
}) {
  const githubResolve = useResolveGitHubRelease();
  const cosResolve = useResolveCosPath();
  const sources = usePackageSources();
  const configured = (sources.data ?? []).find(
    (item) => item.component === component,
  );
  const githubRepo = configured?.githubRepo ?? null;
  const githubConfigured = Boolean(githubRepo);
  const cosConfigured = Boolean(configured?.cosBucket && configured?.cosPrefix);

  const [source, setSource] = useState<ResolveSource>("github");
  // 配置是异步到的：只配了 COS 的组件把默认来源切到 COS。
  useEffect(() => {
    setSource((current) => {
      if (current === "github" && !githubConfigured && cosConfigured)
        return "cos";
      if (current === "cos" && !cosConfigured && githubConfigured)
        return "github";
      return current;
    });
  }, [githubConfigured, cosConfigured]);

  const sourceConfigured =
    source === "github" ? githubConfigured : cosConfigured;
  const latest = usePackageLatest(
    sourceConfigured ? component : "",
    latestVersion,
    source,
  );

  const [version, setVersion] = useState(latestVersion ?? "");
  // 发布记录比表单晚到时补默认值；操作者已经改过就不覆盖。
  useEffect(() => {
    setVersion((current) => (current ? current : (latestVersion ?? "")));
  }, [latestVersion]);

  const [manual, setManual] = useState(false);
  const [manualVersion, setManualVersion] = useState(false);
  const [sourceInput, setSourceInput] = useState("");
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState<string | null>(null);
  // 操作者一旦手动改过版本号/地址，后续自动探测就不许再覆盖表单。
  const [userTouched, setUserTouched] = useState(false);

  const resolve = source === "github" ? githubResolve : cosResolve;
  const composed = composePackageSourceUrl(configured, source, version);
  const useManual = manual || !sourceConfigured;

  // 切来源时清掉「已自动填充」的标记（新来源的数据到了可以重新填），
  // 但**保留**填充说明：下方表单里可能仍是上一个来源填好的值，别让人以为它凭空来的。
  useEffect(() => {
    setAutoFilled(null);
  }, [source]);

  // 探到新版本就自动填表（同一版本只填一次，避免覆盖操作者之后的修改）。
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  useEffect(() => {
    const data = latest.data;
    if (userTouched) return;
    if (!data || data.upToDate || data.imported || !data.version) return;
    if (data.version === autoFilled) return;
    setAutoFilled(data.version);
    setResolveNote(
      onResolvedRef.current({ version: data.version, assets: data.assets }),
    );
  }, [latest.data, autoFilled, userTouched]);

  function handleResolve() {
    const value = (useManual ? sourceInput : composed).trim();
    if (!value) return;
    resolve.mutate(value, {
      onSuccess: (result) => {
        setUserTouched(true);
        setResolveNote(onResolved(result));
      },
    });
  }

  // 只取服务端的 `detail`（如 "the recorded version was not found …"），不要把整条 URL 甩给用户。
  const latestError = latest.error
    ? latest.error instanceof ApiError && latest.error.detail
      ? latest.error.detail
      : String(latest.error)
    : null;
  const showVersionInput =
    manualVersion ||
    (!latest.isLoading && !latest.data && Boolean(latestError));
  const latestStatus = latest.isLoading
    ? source === "cos"
      ? "正在检查最新版本…（COS 逐个版本探测，通常十几秒）"
      : "正在检查最新版本…"
    : latestError
      ? `自动检查失败：${latestError}`
      : latest.data
        ? latest.data.upToDate || latest.data.imported
          ? latest.data.upToDate
            ? latest.data.source === "cos"
              ? `COS 上未探测到新版本（基准 ${latest.data.version}）`
              : `已是最新 ${latest.data.version}（已录入）`
            : `最新版本 ${latest.data.version} 已录入`
          : `发现新版本 ${latest.data.version}（${latest.data.source === "github" ? "GitHub" : "COS"}），已自动填入下方表单。`
        : "";

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
              setManualVersion(false);
            }}
          >
            {value === "github" ? "GitHub Release" : "COS 路径"}
          </button>
        ))}
      </div>

      {!useManual ? (
        <>
          <div className={styles.latestStatus}>
            <span>{latestStatus}</span>
            <button
              type="button"
              className={styles.resolveLink}
              onClick={() => {
                // 显式点「重新检查」= 允许本次探测结果覆盖表单，给手动改过之后一个回退口。
                setUserTouched(false);
                setAutoFilled(null);
                latest.refetch();
              }}
              disabled={latest.isFetching}
            >
              {latest.isFetching ? "检查中…" : "重新检查"}
            </button>
            {!showVersionInput ? (
              <button
                type="button"
                className={styles.resolveLink}
                onClick={() => {
                  setUserTouched(true);
                  setManualVersion(true);
                }}
              >
                手动指定版本
              </button>
            ) : null}
            <button
              type="button"
              className={styles.resolveLink}
              onClick={() => {
                setUserTouched(true);
                setManual(true);
              }}
            >
              或直接粘贴地址
            </button>
          </div>

          {showVersionInput ? (
            <div className={styles.resolveField}>
              <span className={styles.resolveLabel}>
                {source === "github"
                  ? "版本号（按配置的 GitHub 仓库拼 release 地址）"
                  : "版本号（按配置的 COS 前缀拼路径）"}
              </span>
              <div className={styles.resolveControls}>
                <TextInput
                  value={version}
                  onChange={(event) => {
                    setUserTouched(true);
                    setVersion(event.target.value);
                    if (resolveNote) setResolveNote(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleResolve();
                    }
                  }}
                  placeholder="如 v0.4.0-alpha"
                />
                <button
                  type="button"
                  className={styles.resolveButton}
                  onClick={handleResolve}
                  disabled={resolve.isPending || !composed}
                >
                  {resolve.isPending ? "检查中…" : "检查 URL"}
                </button>
              </div>
              <p className={styles.resolveTarget}>
                将检查 <code>{composed || "（填版本号后按配置拼出地址）"}</code>
              </p>
            </div>
          ) : null}
        </>
      ) : (
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
                setUserTouched(true);
                setSourceInput(event.target.value);
                if (resolveNote) setResolveNote(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleResolve();
                }
              }}
              placeholder={
                source === "github"
                  ? "https://github.com/<owner>/<repo>/releases/tag/<tag>"
                  : "桶/组件/版本，如 github-1347593047/wist-gwlinkd/v0.9.3-alpha"
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
          {sourceConfigured ? (
            <p className={styles.resolveTarget}>
              <button
                type="button"
                className={styles.resolveLink}
                onClick={() => setManual(false)}
              >
                返回自动检查
              </button>
            </p>
          ) : null}
        </div>
      )}

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
  latestVersion,
}: {
  target: PackageTarget;
  platforms: PlatformSlot[];
  latestVersion?: string;
}) {
  const mutation = usePublishReleaseBatch(target.component);
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(() =>
    readLastReleaseJob(target.component),
  );
  const trackedJobId = trackableJobId(jobId);
  const jobQuery = useReleaseJob(trackedJobId);
  const job = jobQuery.data ?? mutation.data?.data ?? null;
  const refreshedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.state !== "succeeded" || job.jobId === refreshedJob.current)
      return;
    refreshedJob.current = job.jobId;
    void queryClient.invalidateQueries({
      queryKey: ["releases", target.component],
    });
  }, [job, queryClient, target.component]);
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
        onSuccess: (result) => {
          setJobId(result.data.jobId);
          rememberLastReleaseJob(target.component, result.data.jobId);
          setRows(platforms.map(blankRow));
          setErrors(platforms.map(() => null));
        },
      },
    );
  }

  return (
    <>
      <form className={styles.variants} onSubmit={handleSubmit}>
        <p className={styles.variantsHint}>
          该组件为多平台：一次必须录入{" "}
          <strong>macOS-ARM / Linux-x86_64-musl / Linux-ARM64-musl</strong>{" "}
          三个制品（同一版本）。全部校验通过才会落库。
        </p>
        <ResolveSourceField
          component={target.component}
          latestVersion={latestVersion}
          onResolved={handleResolved}
        />
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
            {mutation.isPending ? "入队中…" : "提交三平台"}
          </PrimaryButton>
        </div>
      </form>
      {mutation.error ? (
        <ErrorBanner>批量提交失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {jobQuery.isError && jobId ? (
        <ErrorBanner>
          任务反馈暂时取不到（正在自动重试）：{String(jobQuery.error)}
        </ErrorBanner>
      ) : null}
      {trackedJobId && jobQuery.isPending && !job ? (
        <p className={styles.jobHint}>正在读取任务反馈…</p>
      ) : null}
      {job ? <ReleaseJobStatus job={job} /> : null}
      {job?.state === "succeeded" && job.package ? (
        <div className={styles.variantsReceipts}>
          <ReleaseReceipt release={job.package} />
        </div>
      ) : null}
      {job?.state === "failed" ? (
        <ErrorBanner>
          下载 / 录入失败：{job.errorDetail ?? job.errorCode ?? "未知原因"}
        </ErrorBanner>
      ) : null}
    </>
  );
}

/** 下载任务状态 → 短词 / 颜色（页面与任务列表共用）。 */
function jobStateLabel(state: string): string {
  switch (state) {
    case "queued":
      return "排队中";
    case "running":
      return "下载 / 校验中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
    default:
      return state || "未知";
  }
}

function jobStateTone(
  state: string,
): "blue" | "amber" | "green" | "red" | "gray" {
  switch (state) {
    case "queued":
      return "blue";
    case "running":
      return "amber";
    case "succeeded":
      return "green";
    case "failed":
      return "red";
    case "canceled":
      return "gray";
    default:
      return "gray";
  }
}

function jobStateHint(job: ReleaseDownloadJob): string {
  const total = job.artifacts.length;
  const progress =
    total > 0 ? `已处理 ${job.completedArtifacts}/${total} 个制品` : "";
  switch (job.state) {
    case "queued":
      return "已入队：前面的下载任务完成后自动开始。";
    case "running":
      return [job.message ?? "正在从远程取包…", progress]
        .filter(Boolean)
        .join("；");
    case "succeeded":
      return job.package
        ? `已录入版本 ${job.package.version}。`
        : "下载与落库已完成。";
    case "failed":
      return job.errorDetail ?? job.errorCode ?? "失败原因未提供。";
    case "canceled":
      return "已取消：任务不会再执行，也不会产生发布记录。";
    default:
      return job.message ?? "";
  }
}

/** 当前表单最近一次提交的任务：状态 + 任务 id + 一句可读进度。 */
function ReleaseJobStatus({ job }: { job: ReleaseDownloadJob }) {
  const cancel = useCancelJob();

  function handleCancel() {
    if (
      !window.confirm(
        `取消排队中的任务 ${job.jobId}？取消后不会再下载，也不会产生发布记录。`,
      )
    ) {
      return;
    }
    cancel.mutate(job.jobId);
  }

  return (
    <div className={styles.jobStatus}>
      <div className={styles.jobStatusHead}>
        <Badge tone={jobStateTone(job.state)}>{jobStateLabel(job.state)}</Badge>
        <code className={styles.jobId}>{job.jobId}</code>
        <span className={styles.jobMeta}>
          {job.artifacts.length} 个制品 · 入队 {formatDateTime(job.createdAt)}
        </span>
        {job.state === "queued" ? (
          <button
            type="button"
            className={styles.jobCancel}
            disabled={cancel.isPending}
            onClick={handleCancel}
          >
            {cancel.isPending && cancel.variables === job.jobId
              ? "取消中…"
              : "取消"}
          </button>
        ) : null}
      </div>
      <p className={styles.jobHint}>{jobStateHint(job)}</p>
      {cancel.error ? (
        <p className={styles.jobNotice}>取消失败：{String(cancel.error)}</p>
      ) : null}
    </div>
  );
}

/** 该组件最近的下载任务（队列串行执行；刷新页面也还在）。 */
function DownloadJobsSection({ jobs }: { jobs: ReleaseDownloadJob[] }) {
  const cancel = useCancelJob();

  function handleCancel(jobId: string) {
    if (
      !window.confirm(
        `取消排队中的任务 ${jobId}？取消后不会再下载，也不会产生发布记录。`,
      )
    ) {
      return;
    }
    cancel.mutate(jobId);
  }

  return (
    <div className={styles.history}>
      <div className={styles.historyHeader}>
        <h3 className={styles.historyTitle}>下载任务</h3>
        <span className={styles.historyHint}>
          队列串行执行 · 最近 {jobs.length} 条
        </span>
      </div>
      {cancel.error ? (
        <div className={styles.jobNotice}>取消失败：{String(cancel.error)}</div>
      ) : null}
      {jobs.length === 0 ? (
        <div className={styles.historyEmpty}>暂无下载任务。</div>
      ) : (
        <div className={styles.jobList}>
          {jobs.map((job) => (
            <div key={job.jobId} className={styles.jobItem}>
              <Badge tone={jobStateTone(job.state)}>
                {jobStateLabel(job.state)}
              </Badge>
              <code className={styles.jobId}>{job.jobId}</code>
              <span className={styles.jobMeta}>
                {job.artifacts.length} 个制品 ·{" "}
                {formatDateTime(
                  job.finishedAt ?? job.startedAt ?? job.createdAt,
                )}
              </span>
              {job.state === "running" && job.artifacts.length > 0 ? (
                <span className={styles.jobMeta}>
                  {job.completedArtifacts}/{job.artifacts.length}
                </span>
              ) : null}
              {job.package ? (
                <span className={styles.jobMeta}>
                  版本 {job.package.version}
                </span>
              ) : null}
              {job.state === "queued" ? (
                <button
                  type="button"
                  className={styles.jobCancel}
                  disabled={cancel.isPending}
                  onClick={() => handleCancel(job.jobId)}
                >
                  {cancel.isPending && cancel.variables === job.jobId
                    ? "取消中…"
                    : "取消"}
                </button>
              ) : null}
              {job.state === "failed" ? (
                <span className={styles.jobError}>
                  {job.errorDetail ?? job.errorCode}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 一次录入回执：一个安装包（版本 + 多平台制品）+ 兼容性。 */
function ReleaseReceipt({ release }: { release: ReleasePackage }) {
  return (
    <>
      <ReceiptCard
        title="本次提交回执"
        fields={[
          ["版本", release.version],
          ["状态", releaseStatusLabel(release.status)],
          [
            "兼容性",
            <span className={styles.receiptCompat}>
              <CompatibilityBadge report={release.compatibility} />
              <span className={styles.receiptCompatText}>
                {compatSummary(release.compatibility)}
              </span>
            </span>,
          ],
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
      {release.compat || release.compatibility ? (
        <div className={styles.receiptCompatDetail}>
          <CompatibilityDetail
            manifest={release.compat}
            report={release.compatibility}
          />
        </div>
      ) : null}
    </>
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
              className={styles.historyEntry}
            >
              <div className={styles.historyItem}>
                <strong className={styles.historyVersion}>
                  {record.version}
                </strong>
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
                <CompatibilityBadge report={record.compatibility} />
                {formatDateTime(record.publishedAt)}
              </span>
              </div>
              <details className={styles.historyCompat}>
                <summary className={styles.historyCompatSummary}>
                  兼容性（{compatSummary(record.compatibility)}）
                </summary>
                <CompatibilityDetail
                  manifest={record.compat}
                  report={record.compatibility}
                />
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
