import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rotateGatewayLinkToken } from "../api";
import { ErrorBanner, formatDateTime } from "./ui";
import styles from "./GatewayInstanceDetailPage.module.css";

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
    const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
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

/** 已签发的一次性接入券及随附接入物（仅内存持有，刷新即丢）。 */
interface IssuedLinkToken {
  linkToken: string;
  initUrl: string;
  trustBundlePem: string | null;
  expiresAt: string | null;
  /** 脚本安装命令（`curl ... | bash`）；后端未返回时为空。 */
  installScriptCommand?: string;
  /** 前置环境准备命令（`curl ... | bash`）；后端未返回时为空。 */
  prepareCommand?: string;
}

/**
 * 「安装 + 接入上级控制中心」材料面板。
 *
 * 本面板只**交接入物**：签发一次性接入券，给出「脚本安装命令」（在目标主机把 gops/gx 与
 * gateway-stack 拉起来）与「接入链接」（粘到**本机网关**的「链接上级」页，宿主侧 wist-gwlinkd
 * 环回拉取完成 link-upstream → register）。两条命令都带同一张一次性接入券（短命，刷新即丢）。
 *
 * 签发用**直接调用**（而非 React Query mutation）：面板进入即自动签发一次、刷新即可见；
 * StrictMode / Fast Refresh 下 mutation 状态易被重挂载冲掉，这里用本地 state 更稳。
 *
 * `enrolled`（这台机器**已经接入并在上报**）时改两件事：**不再进入即自动签发**（那会顺手把
 * 现有的一次性接入券轮换掉，对一台已经跑着的网关是没来由的副作用），安装代码也不再默认摆出来
 * —— 已经接入的机器不需要它，要重装就显式点「重新签发」。
 */
export function GatewayAccessPanel({
  gatewayId,
  example,
  enrolled = false,
}: {
  gatewayId: string;
  /** 数据来自内置示例（后端管理接口未就绪）→ 不能签发真实接入券，禁用并说明。 */
  example: boolean;
  /** 这台网关**已接入并在上报**（Running）：材料只在重装时用，故不自动签发、不默认摆安装代码。 */
  enrolled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [issued, setIssued] = useState<IssuedLinkToken | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 自动签发只做一次（同一 gatewayId）：避免重渲染反复轮换。
  const autoIssuedFor = useRef<string | null>(null);

  const issue = useCallback(async () => {
    if (!gatewayId) return;
    setPending(true);
    setError(null);
    try {
      const result = await rotateGatewayLinkToken({
        gatewayId,
        requestedBy: "admin",
      });
      const install = result.data.install;
      setIssued({
        linkToken: install.linkToken,
        initUrl: install.initUrl,
        trustBundlePem: install.trustBundlePem,
        expiresAt: result.data.linkExpiresAt,
        installScriptCommand: install.installScriptCommand,
        prepareCommand: install.prepareCommand,
      });
      void queryClient.invalidateQueries({ queryKey: ["gateway-instances"] });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  }, [gatewayId, queryClient]);

  // 进入页面即自动签发一次（后端实例存在、且**这台还没接入**时）：让「安装代码 + 接入链接」直接
  // 可见，无需手动点。注意：这会**轮换**该实例当前的接入券（旧券立即作废）。
  // 已经接入（`enrolled`）的机器**不自动签发**：它不需要安装材料，而自动签发会没来由地把券换掉。
  useEffect(() => {
    if (example || enrolled || !gatewayId) return;
    if (autoIssuedFor.current === gatewayId) return;
    autoIssuedFor.current = gatewayId;
    void issue();
  }, [gatewayId, example, enrolled, issue]);

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>安装与接入上级控制中心</h2>
        <p className={styles.cardSubtitle}>
          签发一次性接入券后，页面上同时给出两类材料：**脚本安装命令**（在目标主机把 gops/gx
          与 gateway-stack 拉起来）与**接入链接**（粘到**本机网关**的「链接上级」页，宿主侧
          wist-gwlinkd 环回拉取并完成接入）。两条命令都带同一张一次性接入券。
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
                  {enrolled
                    ? "这台网关已经接入：安装材料只在重新安装 / 加新机器时才需要。点「重新签发」才会生成新的接入券（旧券立即作废）—— 未点之前不会自动轮换。"
                    : "一次性、短命：明文只在本页展示一次（刷新即丢）；进入本页已自动签发一张，点「重新签发」即轮换，旧券同时作废。"}
                </p>
              </div>
              <button
                type="button"
                className={styles.generateButton}
                onClick={() => void issue()}
                disabled={pending || example}
              >
                {pending
                  ? "生成中…"
                  : issued || enrolled
                    ? "重新签发"
                    : "生成接入券"}
              </button>
            </div>
            {example ? (
              <p className={styles.tokenHint}>
                当前是示例数据（后端管理接口未就绪），无法签发真实接入券；请先让后端可达。
              </p>
            ) : null}
            {error ? (
              <ErrorBanner>生成/轮换接入券失败：{error}</ErrorBanner>
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
                <span className={styles.infoLabel}>环境准备（前置）</span>
                <p className={styles.tokenHint}>
                  在目标主机上先执行这条命令，补齐 tar / docker / docker compose（缺则装，可重复跑）。
                </p>
              </div>
            </div>

            {issued?.prepareCommand ? (
              <CodeBlock
                label="环境准备命令（curl … | bash）"
                code={issued.prepareCommand}
                hint="无需令牌；先跑它，再跑下面的安装命令。"
              />
            ) : (
              <p className={styles.curlPlaceholder}>
                {enrolled
                  ? "这台网关已接入；要重装这台机器，先点上面的「重新签发」，这里会出现环境准备命令。"
                  : "尚未就绪 —— 先点上面的「生成/轮换接入券」，这里会出现环境准备命令。"}
              </p>
            )}
          </div>
        </li>

        <li className={styles.step}>
          <span className={styles.stepIndex} aria-hidden="true">
            3
          </span>
          <div className={styles.stepBody}>
            <div className={styles.stepHead}>
              <div>
                <span className={styles.infoLabel}>脚本安装网关</span>
                <p className={styles.tokenHint}>
                  在目标主机上执行这条命令：装 gops/gx → 生成工程 → 导入 gateway-stack
                  → 本地化 → 拉取制品 → 启动 → 装宿主侧 wist-gwlinkd（网关接入器）。
                </p>
              </div>
            </div>

            {issued?.installScriptCommand ? (
              <CodeBlock
                label="安装代码（curl … | bash）"
                code={issued.installScriptCommand}
                hint={
                  issued.expiresAt
                    ? `全新安装需先设定网关对外域名（脚本会提示输入，或 GATEWAY_DOMAIN=gw.example.com bash）。命令带一次性接入券，有效期至 ${formatDateTime(issued.expiresAt)}，过期请重新轮换。`
                    : "全新安装需先设定网关对外域名（脚本会提示输入，或 GATEWAY_DOMAIN=… bash）。命令带一次性接入券，刷新后请重新轮换。"
                }
              />
            ) : (
              <p className={styles.curlPlaceholder}>
                {enrolled
                  ? "这台网关已接入，不需要安装代码。要重装这台机器，先点上面的「重新签发」生成新的接入券。"
                  : "尚未签发 —— 先点上面的「生成/轮换接入券」，这里会出现要贴到目标主机的安装命令。"}
              </p>
            )}
          </div>
        </li>

        <li className={styles.step}>
          <span className={styles.stepIndex} aria-hidden="true">
            4
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
                {enrolled
                  ? "这台网关已接入，不需要接入链接。要重装这台机器，先点上面的「重新签发」生成新的接入券。"
                  : "尚未签发 —— 先点上面的「生成/轮换接入券」，这里会出现要贴给网关的接入链接。"}
              </p>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
