import { Link, useParams } from "react-router-dom";
import { type GatewayInstanceLifecycleState } from "../api";
import {
  useCreateGatewayInstance,
  useGatewayInstances,
  useGatewayLifecycle,
} from "../hooks";
import { GatewayAccessPanel } from "./GatewayAccessPanel";
import { GatewayCustomerBindPanel } from "./GatewayCustomerBindPanel";
import { ExampleDataTag } from "./GatewayStatusOverviewMetrics";
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
  const create = useCreateGatewayInstance();
  // 数据来自内置示例（后端管理接口未就绪）时，不能签发真实接入券 —— 禁用且说明。
  const instanceIsExample = instancesData?.source === "example";

  function handleCreateInstance() {
    if (!gatewayId) return;
    // 创建后实例以 Provisioned 出现；总览刷新（hook 已 invalidate）后本页自动切到详情，可生成接入链接。
    create.mutate({ gatewayName: gatewayId, requestedBy: "admin" });
  }

  return (
    <PageShell
      title={instance ? `连接 Gateway · ${instance.gatewayId}` : "连接 Gateway"}
      summary="生成网关安装材料：脚本安装命令（curl … | bash，装 gops/gx 并拉起 gateway-stack）与接入链接（中心地址 + 接入券 + CA），前者部署本机软件、后者粘到网关「链接上级」页完成接入。"
    >
      <Link to="/instance" className={styles.backLink}>
        ← 返回网关管理
      </Link>

      <ExampleDataTag source={instancesData?.source} />

      {isLoading && !instance ? <LoadingDots /> : null}

      {instancesError ? (
        <div className={styles.feedback}>
          <ErrorBanner>实例信息加载失败：{String(instancesError)}</ErrorBanner>
        </div>
      ) : null}

      {!isLoading && !instancesError && !instance ? (
        <section className={styles.notFound}>
          <h2>未找到该网关实例</h2>
          <p>
            该实例尚未创建（或已删除、或当前管理凭证无权查看）。要接入网关，先创建它：
          </p>
          {gatewayId ? (
            <button
              type="button"
              className={styles.primaryLink}
              onClick={handleCreateInstance}
              disabled={create.isPending || instanceIsExample}
            >
              {create.isPending ? "创建中…" : `创建网关实例「${gatewayId}」`}
            </button>
          ) : null}
          {create.error ? (
            <ErrorBanner>创建失败：{String(create.error)}</ErrorBanner>
          ) : null}
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

          <GatewayAccessPanel
            gatewayId={instance.gatewayId}
            example={instanceIsExample}
            // `Running` = 已接入并在上报（首次上报才从 Initializing 变 Running）：材料只在重装时用，
            // 故不自动轮换接入券、也不默认摆安装代码。
            enrolled={instance.lifecycleState === "Running"}
          />

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
