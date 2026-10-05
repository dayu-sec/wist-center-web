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

/** 从初始化 URL 取控制中心 endpoint（协议+主机+端口）。 */
function endpointOrigin(initUrl: string): string {
  try {
    return new URL(initUrl).origin;
  } catch {
    return initUrl;
  }
}

/** 拼宿主侧 `wist-gwlinkd` 的 `gwlinkd.toml`（接入物之一）。 */
function gwlinkdToml(initUrl: string, gatewayId: string): string {
  return [
    `control_center_endpoint = "${endpointOrigin(initUrl)}"`,
    `trust_bundle = "/etc/wist-gwlinkd/control-center.pem"`,
    `state_dir = "/var/lib/wist-gwlinkd"`,
    `gateway_id = "${gatewayId}"`,
  ].join("\n");
}

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
 * 设计（`gateway-secure-registration.md` §3/§6/§8）：接入凭据是一张**一次性、短命**的接入券，
 * 明文**只在 Center 页面一次性展示**（刷新即丢）；Center 只存 hash，**再取只能「生成/轮换」**
 * （旧券同时作废）。创建实例**不**交付凭据。宿主侧 `wist-gwlinkd` 用「接入券 + Center 地址」
 * 发起 `link-upstream → register`，换回客户端证书（mTLS 长期身份）。
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
  const [addressCopied, setAddressCopied] = useState(false);

  const initUrl =
    issued?.initUrl ??
    instance?.initUrl ??
    `/api/v1/gateway/link-upstream?gateway_id=${encodeURIComponent(gatewayId)}`;

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

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(initUrl);
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 1500);
    } catch {
      // 剪贴板不可用时保留可选中的 URL。
    }
  }

  return (
    <PageShell
      title={instance ? `连接 Gateway · ${instance.gatewayId}` : "连接 Gateway"}
      summary="生成一次性接入券并交给宿主侧的 wist-gwlinkd：它以「接入券 + Center 地址」接入上级控制中心，随后换回客户端证书。"
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
              <h2 className={styles.cardTitle}>接入券</h2>
              <p className={styles.cardSubtitle}>
                接入券由 Center 签发，**一次性、短命**：明文只在本页展示一次（刷新即丢），
                再取只能「生成/轮换」（旧券同时作废）。
              </p>
            </header>

            <div className={styles.endpointColumn}>
              <div className={styles.tokenBuilder}>
                <div>
                  <span className={styles.infoLabel}>生成 / 轮换接入券</span>
                  <p className={styles.tokenHint}>
                    生成一张新的接入券并把「Center 接入地址 + CA 信任锚 + gwlinkd 配置」一并交给你。
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

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Center 接入地址</span>
                <div className={styles.urlRow}>
                  <code className={styles.url}>{initUrl}</code>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={copyAddress}
                  >
                    {addressCopied ? "已复制" : "复制"}
                  </button>
                </div>
              </div>

              {issued ? (
                <>
                  <CodeBlock
                    label="接入券（一次性接入凭据）"
                    code={issued.linkToken}
                    hint={
                      issued.expiresAt
                        ? `仅本页显示一次；有效期至 ${formatDateTime(issued.expiresAt)}，过期或刷新后请重新轮换。`
                        : "仅本页显示一次；刷新后请重新轮换。"
                    }
                  />
                  {issued.trustBundlePem ? (
                    <CodeBlock
                      label="控制中心 CA 信任锚（存为 control-center.pem）"
                      code={issued.trustBundlePem}
                      filename="control-center.pem"
                      hint="宿主侧 gwlinkd 以此校验 Center 的服务器证书（CA-S）。"
                    />
                  ) : null}
                  <CodeBlock
                    label="宿主侧 gwlinkd 配置（存为 /etc/wist-gwlinkd/gwlinkd.toml）"
                    code={gwlinkdToml(initUrl, instance.gatewayId)}
                    filename="gwlinkd.toml"
                  />
                  <CodeBlock
                    label="宿主侧运行 wist-gwlinkd（首跑用它接入）"
                    code={`WIST_GWLINKD_LINK_TOKEN=${issued.linkToken} wist-gwlinkd run`}
                    hint="首跑：link-upstream（出示接入券）→ register（换回客户端证书）；之后走 mTLS。"
                  />
                </>
              ) : (
                <p className={styles.curlPlaceholder}>
                  尚未生成接入券 —— 点「生成/轮换接入券」即可拿到一次性接入券与全部接入物。
                </p>
              )}
            </div>
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
