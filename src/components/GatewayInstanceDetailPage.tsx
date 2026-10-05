import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type GatewayInstanceLifecycleState } from "../api";
import {
  useGatewayInstances,
  useGatewayLifecycle,
  useRotateGatewayLinkToken,
} from "../hooks";
import { GatewayCustomerBindPanel } from "./GatewayCustomerBindPanel";
import {
  Badge,
  type BadgeTone,
  ErrorBanner,
  formatDateTime,
  LoadingDots,
  PageShell,
  lifecycleLabel,
} from "./ui";
import styles from "./GatewayInstanceDetailPage.module.css";

function lifecycleTone(state: GatewayInstanceLifecycleState): BadgeTone {
  switch (state) {
    case "Running":
      return "green";
    case "Initializing":
      return "blue";
    case "Provisioned":
      return "gray";
    case "Failed":
      return "red";
  }
}

/** base64url（无填充）编码 UTF-8 文本：把多行 PEM 塞进 URL query。 */
function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 一条接入链接：中心地址 + `gateway_id` + 接入券 + CA 信任锚（`ca` = base64url(PEM)）。
 * 网关「链接上级」页只收这一条 URL，解出三者后提交给本机网关。
 * 注意：这是**复制粘贴的凭据串**（不点开、不进地址栏），故容忍券/CA 在 URL 里。
 */
function buildLinkUrl(initUrl: string, linkToken: string, caPem: string | null): string {
  const url = new URL(initUrl);
  url.searchParams.set("link_token", linkToken);
  if (caPem) url.searchParams.set("ca", base64UrlEncode(caPem));
  return url.toString();
}

/** 已签发的一次性接入券及随附接入物（仅本页内存持有，刷新即丢）。 */
/** 代码块：展示 + 复制（可选下载）。 */
function CodeBlock({
  label,
  code,
  filename,
  hint,
}: {
  label: string;
  code: string;
  filename?: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时保留可选中的原始文本。
    }
  }

  function handleDownload() {
    if (!filename) return;
    const blobUrl = URL.createObjectURL(
      new Blob([code], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className={styles.curlBlock}>
      <div className={styles.curlHeader}>
        <div>
          <span className={styles.infoLabel}>{label}</span>
          {hint ? <p className={styles.curlHint}>{hint}</p> : null}
        </div>
        <div>
          {filename ? (
            <button
              type="button"
              className={styles.curlCopyButton}
              onClick={handleDownload}
            >
              下载
            </button>
          ) : null}
          <button
            type="button"
            className={styles.curlCopyButton}
            onClick={handleCopy}
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      <pre className={styles.curlCode}>{code}</pre>
    </div>
  );
}

/** 已签发的一次性接入券及随附接入物（仅本页内存持有，刷新即丢）。 */
interface IssuedLinkToken {
  linkToken: string;
  initUrl: string;
  trustBundlePem: string | null;
  expiresAt: string | null;
}

/**
 * 「连接 Gateway」：把 Gateway 接入上级控制中心。
 *
 * 本页只**交接入物**：生成一次性接入券，把「中心地址 + 接入券 + CA 信任锚」交给运维，
 * 让他填到**本机网关**的「链接上级」页；真正的接入由宿主侧 `wist-gwlinkd` 环回拉取完成
 * （link-upstream → register，换回客户端证书 mTLS）—— 无需 CLI。
 * 设计：`edge/gateway-onboard-request.md`；凭据一次性/短命口径同 `gateway-secure-registration.md`。
 */
export function GatewayInstanceDetailPage() {
  const { gatewayId = "" } = useParams();
  const {
    data: instancesData,
    error: instancesError,
    isLoading,
  } = useGatewayInstances();
  const instance = instancesData?.data.find(
    (item) => item.gatewayId === gatewayId,
  );
  const {
    data: lifecycleData,
    error: lifecycleError,
    isLoading: lifecycleLoading,
  } = useGatewayLifecycle(instance?.gatewayId ?? "");
  const rotate = useRotateGatewayLinkToken();
  const [issued, setIssued] = useState<IssuedLinkToken | null>(null);

  function handleRotateToken() {
    if (!instance) return;
    rotate.mutate(
      { gatewayId: instance.gatewayId, requestedBy: "admin" },
      {
        onSuccess: (result) => {
          const install = result.data.install;
          setIssued({
            linkToken: install.linkToken,
            initUrl: install.initUrl,
            trustBundlePem: install.trustBundlePem,
            expiresAt: result.data.linkExpiresAt,
          });
        },
      },
    );
  }

  return (
    <PageShell
      title={instance ? `连接 Gateway · ${instance.gatewayId}` : "连接 Gateway"}
      summary="生成一条接入链接（含中心地址 + 接入券 + CA），粘到本机网关的「链接上级」页；宿主侧 gwlinkd 环回拉取并完成接入（无需 CLI）。"
    >
      <Link to="/instance" className={styles.backLink}>
        ← 返回网关管理
      </Link>

      {isLoading && !instance ? <LoadingDots /> : null}

      {instancesError ? (
        <div className={styles.feedback}>
          <ErrorBanner>实例信息加载失败：{String(instancesError)}</ErrorBanner>
        </div>
      ) : null}

      {!isLoading && !instancesError && !instance ? (
        <section className={styles.notFound}>
          <h2>未找到该网关实例</h2>
          <p>实例可能已删除，或当前管理凭证无权查看。</p>
          <Link to="/instance" className={styles.primaryLink}>
            返回实例列表
          </Link>
        </section>
      ) : null}

      {instance ? (
        <div className={styles.content}>
          <section className={styles.hero}>
            <div>
              <h2 className={styles.gatewayId}>{instance.gatewayId}</h2>
              <p className={styles.instanceId}>
                {instance.instanceId || "实例尚未上报 instance_id"}
              </p>
            </div>
            <Badge tone={lifecycleTone(instance.lifecycleState)}>
              {lifecycleLabel(instance.lifecycleState)}
            </Badge>
          </section>

          <section className={styles.card}>
            <header className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>接入上级控制中心</h2>
              <p className={styles.cardSubtitle}>
                签发一次性接入券，生成**一条接入链接**（含中心地址 + 接入券 + CA 信任锚），
                粘到**本机网关**的「链接上级」页即可；宿主侧 wist-gwlinkd 会环回拉取并完成接入
                （link-upstream → register），无需 CLI。
              </p>
            </header>

            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepIndex} aria-hidden="true">
                  1
                </span>
                <div className={styles.stepBody}>
                  <div className={styles.stepHead}>
                    <div>
                      <span className={styles.infoLabel}>签发接入券</span>
                      <p className={styles.tokenHint}>
                        一次性、短命：明文只在本页展示一次（刷新即丢）；再取即「生成/轮换」，旧券同时作废。
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.generateButton}
                      onClick={handleRotateToken}
                      disabled={rotate.isPending}
                    >
                      {rotate.isPending ? "生成中…" : "生成/轮换接入券"}
                    </button>
                  </div>
                  {rotate.error ? (
                    <ErrorBanner>
                      生成/轮换接入券失败：{String(rotate.error)}
                    </ErrorBanner>
                  ) : null}
                </div>
              </li>

              <li className={styles.step}>
                <span className={styles.stepIndex} aria-hidden="true">
                  2
                </span>
                <div className={styles.stepBody}>
                  <div className={styles.stepHead}>
                    <div>
                      <span className={styles.infoLabel}>粘到网关的「链接上级」页</span>
                      <p className={styles.tokenHint}>
                        在网关管理界面打开「链接上级」，把这一条接入链接粘进输入框并提交。
                      </p>
                    </div>
                  </div>

                  {issued ? (
                    <CodeBlock
                      label="接入链接（中心地址 + 接入券 + CA 信任锚）"
                      code={buildLinkUrl(
                        issued.initUrl,
                        issued.linkToken,
                        issued.trustBundlePem,
                      )}
                      hint={
                        issued.expiresAt
                          ? `把这一条粘到网关「链接上级」页的输入框；有效期至 ${formatDateTime(issued.expiresAt)}，过期或刷新后请重新轮换。`
                          : "把这一条粘到网关「链接上级」页的输入框；刷新后请重新轮换。"
                      }
                    />
                  ) : (
                    <p className={styles.curlPlaceholder}>
                      尚未签发 —— 先点上面的「生成/轮换接入券」，这里会出现要贴给网关的接入链接。
                    </p>
                  )}
                </div>
              </li>
            </ol>
          </section>

          <section className={styles.card}>
            <header className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>接入进度</h2>
              <p className={styles.cardSubtitle}>
                待接入 → 已出示接入券（Initializing）→ 已上线（Running）。状态由 Center 侧生命周期记录。
              </p>
            </header>
            <div className={styles.timeline}>
              {lifecycleLoading ? <LoadingDots /> : null}
              {lifecycleError ? (
                <ErrorBanner>
                  生命周期加载失败：{String(lifecycleError)}
                </ErrorBanner>
              ) : null}
              {!lifecycleLoading &&
              !lifecycleError &&
              (lifecycleData?.data.length ?? 0) === 0 ? (
                <p className={styles.timelineEmpty}>暂无生命周期事件。</p>
              ) : null}
              {(lifecycleData?.data ?? []).map((event) => (
                <div
                  key={`${event.toState}-${event.at}`}
                  className={styles.event}
                >
                  <span className={styles.eventDot} />
                  <div>
                    <strong>{lifecycleLabel(event.toState)}</strong>
                    <span className={styles.eventMeta}>
                      {formatDateTime(event.at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <GatewayCustomerBindPanel gatewayId={instance.gatewayId} />
        </div>
      ) : null}
    </PageShell>
  );
}
