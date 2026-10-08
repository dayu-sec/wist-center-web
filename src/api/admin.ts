// WarpInsightCenter 全局控制中心 Admin API client.
//
// 面向 AdminFacingInterface 的 HTTP 管理接口（Control.AdminFacingInterface）：
// 网关态势 / 状态视图 / 网关管理 / 版本发布 / 升级计划。
// 后端接口尚未实现时，请求失败自动回退到 example 数据（source: "example"），
// 保证前端独立可渲染；接入真实后端后自动切换为 "real"。

// 离线示例与服务端用**同一套**阶梯 / 制品口径（单一真源在 `@dayu-sec/wist-web-core`，
// 权威仍在 Rust 侧 `wist-release`）。
import { planPhases } from "@dayu-sec/wist-web-core/release";

// 制品来源的版本粗解析也收到共享包里（与 `PackagePanel` 同一个）。
export { versionFromArtifactUrl } from "@dayu-sec/wist-web-core/artifact";

export type GatewayStatus = "online" | "offline" | (string & {});
export type GatewayHealth = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface GatewayStatusView {
  gatewayId: string;
  instanceId: string;
  version: string;
  // 网关对外域名（管理面「对外地址」‖`[server] public_base_url`）；后端 0.9 起上报，老数据为 null。
  publicBaseUrl: string | null;
  status: GatewayStatus;
  health: GatewayHealth;
  memoryBytes: number | null;
  cpuPercent: number | null;
  lastSeenAt: string;
  // 富化（见 wist-design edge/gateway-status-report.md）：后端 0.6.1 起上报；老数据为 null。
  uptimeSeconds: number | null;
  agentCount: number | null;
  onlineAgents: number | null;
  offlineAgents: number | null;
  lastSeenLagSeconds: number | null;
  storeBytes: number | null;
  ingestAcceptedTotal: number | null;
  ingestRejectedTotal: number | null;
  lastIngestAt: string | null;
  memoryTotalBytes: number | null;
  load1m: number | null;
  load5m: number | null;
  load15m: number | null;
  diskUsagePercent: number | null;
  diskTotalBytes: number | null;
  diskAvailableBytes: number | null;
}

export interface GatewayListView {
  gatewayCount: number;
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  updatedAt: string;
}

export interface GatewayUptime {
  gatewayId: string;
  window: string;
  /** 在线率 0..1；无历史数据 / VM 不可达 → null。 */
  uptime: number | null;
}

/** 网关在一个 Unix 秒时间戳上的历史指标采样。 */
export interface GatewayHistorySample {
  at: number;
  online: number | null;
  memoryBytes: number | null;
  cpuPercent: number | null;
  /** 富化指标（可选）：老后端 / 老样本可能没有这些序列。 */
  uptimeSeconds?: number | null;
  agentCount?: number | null;
  onlineAgents?: number | null;
  offlineAgents?: number | null;
  lastSeenLagSeconds?: number | null;
  storeBytes?: number | null;
  load1m?: number | null;
  diskUsagePercent?: number | null;
}

/** 网关历史趋势；当前详情页请求最近 1 小时、每分钟一个采样点。 */
export interface GatewayHistory {
  gatewayId: string;
  window: string;
  stepSeconds: number;
  samples: GatewayHistorySample[];
}

/** 单个 Agent 的历史采样，额外包含管理接口时延。 */
export interface AgentHistorySample extends GatewayHistorySample {
  adminLatencyMs: number | null;
}

export interface AgentHistory {
  agentId: string;
  gatewayId: string;
  window: string;
  stepSeconds: number;
  samples: AgentHistorySample[];
}

export interface AgentStatusView {
  agentId: string;
  instanceId: string;
  version: string;
  status: GatewayStatus;
  health: GatewayHealth;
  memoryBytes: number | null;
  cpuPercent: number | null;
  adminLatencyMs: number | null;
  lastSeenAt: string;
}

export type GatewayInstanceLifecycleState =
  "Provisioned" | "Initializing" | "Running" | "Failed";

export interface GatewayInstance {
  gatewayId: string;
  instanceId: string;
  lifecycleState: GatewayInstanceLifecycleState;
  createdAt: string;
  initializedAt: string | null;
  /** 控制中心生成的不含凭证初始化入口；旧版本接口可能不返回。 */
  initUrl?: string;
}

/** 网关实例安装指引（创建后交付给操作者）。 */
export interface GatewayInstallInfo {
  installCommand: string;
  cloudImage: string;
  initUrl: string;
  /** Center 创建实例时签发的一次性接入券，仅在创建回执中交付。 */
  linkToken: string;
  /** 服务端生成的 curl 验证命令（Bearer 使用一次性接入券）。 */
  initCurl: string;
  /** 控制中心 CA 信任证书；未启用 TLS 时为空。 */
  trustBundlePem: string | null;
}

/** 创建网关实例返回：**仅实例视图**。接入凭据不在 create 响应里交付（设计 §8）。 */
export interface AdminCreateGatewayInstanceReturned {
  instance: GatewayInstance;
}

/** 生成/轮换接入券 返回：新的安装指引（含一次性明文 linkToken）+ 到期时刻。 */
export interface AdminRotateGatewayLinkTokenReturned {
  gatewayId: string;
  install: GatewayInstallInfo;
  /** 接入券到期时刻（RFC3339）；**短 TTL**，过期需重新生成/轮换。 */
  linkExpiresAt: string | null;
}

/** 网关生命周期一次状态转变记录（过程历史）。 */
export interface LifecycleEvent {
  gatewayId: string;
  fromState: GatewayInstanceLifecycleState | null;
  toState: GatewayInstanceLifecycleState;
  at: string;
}

export interface GatewayCustomerBinding {
  gatewayId: string;
  customerId: string;
  status: string;
  boundAt: string;
}

export interface GatewayInitialConfig {
  gatewayId: string;
  controlCenterEndpoint: string;
  protocolVersion: string;
  serverTlsRequired: boolean;
  enrollmentTokenId: string;
}

/**
 * 安装包里的一个**制品**：一个平台 + 内容摘要 + 取件地址。
 *
 * 平台由中心从包自身解析（二进制包文件名 / 包内目录名切 target-triple）；
 * 部署栈类包解析不出时为 `null`（界面显示「通用」）。
 */
export interface ReleaseArtifact {
  /** 目标平台（target-triple）；无平台概念的包为 null。 */
  platform: string | null;
  /** 制品内容 sha256（裸小写 hex）；老记录可能为空串。 */
  sha256: string;
  /** 取件地址（中心镜像后的下载 URL）。 */
  source: string;
}

/**
 * 一个**安装包**：一个版本 + 多个平台制品（galaxy-ops / galaxy-flow 一次录入三平台）。
 *
 * 目录字段 `component` 与托管字段 `status` / `publishedAt` 由中心外挂（`ReleasePackageRecord`）。
 */
export interface ReleasePackage {
  /** 组件（目录键，如 `galaxy-ops`）。 */
  component: string;
  version: string;
  artifacts: ReleaseArtifact[];
  /** 包级托管状态：`published`（在用）/ `expired`（已过期）。 */
  status: string;
  /** 首次录入时间（包级，取组内最早）。 */
  publishedAt: string;
}

/** 结构化升级目标（前端入参；落到计划 `spec` 的 `{"targets":[…]}`）。 */
export interface UpgradeTarget {
  component: string;
  targetVersion: string;
}

/** 灰度发布计划里的一个阶段（模型 `Control.Rollout.RolloutPhase`）。 */
export interface RolloutPhase {
  phaseIndex: number;
  targetIds: string[];
  /** manual | all_succeeded | success_rate:<NN> */
  advanceRule: string;
  /** pending | rolling | completed */
  status: string;
}

/** 灰度发布计划（模型 `Control.Rollout.RolloutPlan`；中心铺的是网关，target = gateway_id）。 */
export interface RolloutPlan {
  planId: string;
  /** 今天只有 `upgrade`。 */
  action: string;
  /** 动作参数（JSON）：`{"targets":[{"component","target_version"}]}`。 */
  spec: string;
  deadlineAt: string | null;
  timeoutSeconds: number;
  phases: RolloutPhase[];
  batchSize: number;
  /** 当前进行到第几阶段（0 = 尚未开始）。 */
  currentPhase: number;
  /** draft | rolling | completed | failed | canceled */
  status: string;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

/** 计划里逐目标（网关）的一行（模型 `Control.Rollout.RolloutPlanEntry`）。 */
export interface RolloutPlanEntry {
  targetId: string;
  workId: string | null;
  /** pending | dispatched | succeeded | failed */
  status: string;
  detail: string;
  updatedAt: string;
}

/** 计划 + 逐目标进度（模型 `Control.Rollout.RolloutPlanView`）。 */
export interface RolloutPlanDetail {
  plan: RolloutPlan;
  entries: RolloutPlanEntry[];
}

/** 拼 `upgrade` 动作的 `spec`（与中心/网关两端的计划口径同形）。 */
export function jsonUpgradeSpec(targets: UpgradeTarget[]): string {
  return JSON.stringify({
    targets: targets.map((target) => ({
      component: target.component,
      // 版本**可省**（留空就不写）：升级器回落用「包内 agentd 自报的版本」
      // —— 与网关侧 `jsonUpgradeSpec` 同一取舍。
      ...(target.targetVersion.trim()
        ? { target_version: target.targetVersion.trim() }
        : {}),
    })),
  });
}

export interface GlobalPolicyDispatch {
  dispatchId: string;
  policyVersion: string;
  targetCount: number;
  status: string;
  dispatchedAt: string;
}

// ── 北向命令 ──

export interface CreateGatewayInstanceCommand {
  gatewayName: string;
  requestedBy: string;
}

export interface RotateGatewayLinkTokenCommand {
  gatewayId: string;
  requestedBy: string;
}

export interface BindGatewayCustomerCommand {
  gatewayId: string;
  customerId: string;
  requestedBy: string;
}

export interface GetGatewayInitialConfigCommand {
  gatewayId: string;
  requestedBy: string;
}

export interface PublishReleaseCommand {
  /** 版本号可省：不填时由中心从**包地址**（文件名 / 包内目录名）自动解析。 */
  version?: string;
  artifactUrl: string;
  /**
   * 期望内容摘要（sha256，可带 `sha256:` 前缀）：中心拿块字节核对，不符即拒。
   *
   * **必填**：包的 sha256 是内容身份，缺了就没有可校验的事实来源（页面也按必填拦）。
   */
  expectedSha256: string;
  requestedBy: string;
}

export interface CreateUpgradePlanCommand {
  /** 动作面：今天只有 `upgrade`。 */
  action: string;
  /** 动作参数（JSON 字符串）；`upgrade` 用 `jsonUpgradeSpec` 从结构化目标拼。 */
  spec: string;
  /** 计划要铺到的目标（gateway_id）。 */
  targetIds: string[];
  /**
   * 分几段灰度（1 = 不分批，一把到位）。可用段数受台数限制，见 `availablePhaseCounts`。
   * **阶段由中心服务端按阶梯切**，前端只给这个数。
   */
  phaseCount: number;
  /** RFC3339 绝对截止。 */
  deadlineAt: string;
  /** 执行预算（秒），必须为正。 */
  timeoutSeconds: number;
  /** 每阶段内同时执行的台数（0 = 不节流）。 */
  batchSize: number;
}

export interface PlanRefCommand {
  planId: string;
}

// ── 结果信封：数据 + 来源标记 ──

export interface ExampleResult<T> {
  data: T;
  source: "real" | "example";
}

// ── 认证与请求包装 ──

export const ADMIN_AUTH_CHANGED_EVENT = "warpInsightCenterAuthChanged";
const ADMIN_API_TOKEN_STORAGE_KEY = "warpInsightCenterApiToken";
const GATEWAY_INIT_CURL_STORAGE_KEY = "warpInsightGatewayInitCurls";

let adminApiToken: string | null =
  typeof window !== "undefined"
    ? window.sessionStorage.getItem(ADMIN_API_TOKEN_STORAGE_KEY)
    : null;

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, path: string, retryAfterSeconds?: number) {
    super(`HTTP ${status} ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isRateLimitedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const adminToken = getAdminApiToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = Number.parseInt(
        response.headers.get("Retry-After") ?? "",
        10,
      );
      throw new ApiError(
        response.status,
        path,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
      );
    }
    throw new ApiError(response.status, path);
  }
  return (await response.json()) as T;
}

export function getAdminApiToken(): string | null {
  return adminApiToken;
}

/** 将创建回执中的 init curl 临时保存在当前浏览器会话，供实例详情页复用。 */
export function storeGatewayInitCurl(
  gatewayId: string,
  initCurl: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(GATEWAY_INIT_CURL_STORAGE_KEY);
    const values: Record<string, string> = raw ? JSON.parse(raw) : {};
    values[gatewayId] = initCurl;
    window.sessionStorage.setItem(
      GATEWAY_INIT_CURL_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // 会话存储不可用时，创建回执仍会在当前页面直接展示命令。
  }
}

/** 读取当前会话中保存的 init curl；历史实例没有回执时返回 null。 */
export function readGatewayInitCurl(gatewayId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GATEWAY_INIT_CURL_STORAGE_KEY);
    if (!raw) return null;
    const values: unknown = JSON.parse(raw);
    if (!values || typeof values !== "object") return null;
    const value = (values as Record<string, unknown>)[gatewayId];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setAdminApiToken(token: string): void {
  const trimmed = token.trim();
  adminApiToken = trimmed || null;
  if (typeof window !== "undefined") {
    if (adminApiToken) {
      window.sessionStorage.setItem(ADMIN_API_TOKEN_STORAGE_KEY, adminApiToken);
    } else {
      window.sessionStorage.removeItem(ADMIN_API_TOKEN_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(ADMIN_AUTH_CHANGED_EVENT));
  }
}

export function clearAdminApiToken(): void {
  setAdminApiToken("");
}

// ── 请求失败回退 example 数据 ──

async function fetchOrFallback<T>(
  path: string,
  fallback: () => T,
  init?: RequestInit,
): Promise<ExampleResult<T>> {
  try {
    const data = await requestJson<T>(path, init);
    return { data, source: "real" };
  } catch (error) {
    if (isRateLimitedError(error)) throw error;
    return { data: fallback(), source: "example" };
  }
}

// ── 类型归一化（snake_case / camelCase 容错） ──

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string") return value;
  throw new Error(`Invalid API response: missing ${fieldName}`);
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number") return value;
  throw new Error(`Invalid API response: missing ${fieldName}`);
}

function pick(obj: any, ...names: string[]): unknown {
  for (const name of names) {
    if (obj?.[name] !== undefined) return obj[name];
  }
  return undefined;
}

function nullableNumber(payload: any, ...names: string[]): number | null {
  const value = pick(payload, ...names);
  return typeof value === "number" ? value : null;
}

/** 可空字符串：缺失 / `null` / 空串 → null；否则原样。 */
function nullableString(payload: any, ...names: string[]): string | null {
  const value = pick(payload, ...names);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeGatewayStatus(value: unknown): GatewayStatus {
  // 模型 status 为 String，取值域未收紧；异常上报值不击穿整个列表，原样透传（徽标兜底显示离线）。
  if (typeof value === "string" && value.length > 0)
    return value as GatewayStatus;
  throw new Error("Invalid API response: invalid gateway status");
}

function normalizeGatewayHealth(value: unknown): GatewayHealth {
  if (value === "healthy" || value === "degraded" || value === "unhealthy")
    return value;
  // 未上报/异常健康值 → "unknown"，徽标显示「未知」。
  return "unknown";
}

function normalizeGatewayStatusView(payload: any): GatewayStatusView {
  return {
    gatewayId: requiredString(
      pick(payload, "gateway_id", "gatewayId"),
      "gateway.gatewayId",
    ),
    instanceId: requiredString(
      pick(payload, "instance_id", "instanceId"),
      "gateway.instanceId",
    ),
    version: requiredString(payload.version, "gateway.version"),
    publicBaseUrl: nullableString(payload, "public_base_url", "publicBaseUrl"),
    status: normalizeGatewayStatus(payload.status),
    health: normalizeGatewayHealth(payload.health),
    memoryBytes: nullableNumber(payload, "memory_bytes", "memoryBytes"),
    cpuPercent: nullableNumber(payload, "cpu_percent", "cpuPercent"),
    lastSeenAt: requiredString(
      pick(payload, "last_seen_at", "lastSeenAt"),
      "gateway.lastSeenAt",
    ),
    uptimeSeconds: nullableNumber(payload, "uptime_seconds", "uptimeSeconds"),
    agentCount: nullableNumber(payload, "agent_count", "agentCount"),
    onlineAgents: nullableNumber(payload, "online_agents", "onlineAgents"),
    offlineAgents: nullableNumber(payload, "offline_agents", "offlineAgents"),
    lastSeenLagSeconds: nullableNumber(
      payload,
      "last_seen_lag_seconds",
      "lastSeenLagSeconds",
    ),
    storeBytes: nullableNumber(payload, "store_bytes", "storeBytes"),
    ingestAcceptedTotal: nullableNumber(
      payload,
      "ingest_accepted_total",
      "ingestAcceptedTotal",
    ),
    ingestRejectedTotal: nullableNumber(
      payload,
      "ingest_rejected_total",
      "ingestRejectedTotal",
    ),
    lastIngestAt: nullableString(payload, "last_ingest_at", "lastIngestAt"),
    memoryTotalBytes: nullableNumber(
      payload,
      "memory_total_bytes",
      "memoryTotalBytes",
    ),
    load1m: nullableNumber(payload, "load_1m", "load1m"),
    load5m: nullableNumber(payload, "load_5m", "load5m"),
    load15m: nullableNumber(payload, "load_15m", "load15m"),
    diskUsagePercent: nullableNumber(
      payload,
      "disk_usage_percent",
      "diskUsagePercent",
    ),
    diskTotalBytes: nullableNumber(payload, "disk_total_bytes", "diskTotalBytes"),
    diskAvailableBytes: nullableNumber(
      payload,
      "disk_available_bytes",
      "diskAvailableBytes",
    ),
  };
}

function normalizeGatewayListView(payload: any): GatewayListView {
  return {
    gatewayCount: requiredNumber(
      pick(payload, "gateway_count", "gatewayCount"),
      "list.gatewayCount",
    ),
    onlineCount: requiredNumber(
      pick(payload, "online_count", "onlineCount"),
      "list.onlineCount",
    ),
    degradedCount: requiredNumber(
      pick(payload, "degraded_count", "degradedCount"),
      "list.degradedCount",
    ),
    offlineCount: requiredNumber(
      pick(payload, "offline_count", "offlineCount"),
      "list.offlineCount",
    ),
    updatedAt: requiredString(
      pick(payload, "updated_at", "updatedAt"),
      "list.updatedAt",
    ),
  };
}

function normalizeGatewayInstallInfo(payload: any): GatewayInstallInfo {
  return {
    installCommand: requiredString(
      pick(payload, "install_command", "installCommand"),
      "install.installCommand",
    ),
    cloudImage: requiredString(
      pick(payload, "cloud_image", "cloudImage"),
      "install.cloudImage",
    ),
    initUrl: requiredString(
      pick(payload, "init_url", "initUrl"),
      "install.initUrl",
    ),
    linkToken: requiredString(
      pick(payload, "link_token", "linkToken"),
      "install.linkToken",
    ),
    initCurl: requiredString(
      pick(payload, "init_curl", "initCurl"),
      "install.initCurl",
    ),
    trustBundlePem:
      pick(payload, "trust_bundle_pem", "trustBundlePem") == null
        ? null
        : String(pick(payload, "trust_bundle_pem", "trustBundlePem")),
  };
}

function normalizeGatewayInstance(payload: any): GatewayInstance {
  const rawInitUrl = pick(payload, "init_url", "initUrl");
  return {
    gatewayId: requiredString(
      pick(payload, "gateway_id", "gatewayId"),
      "instance.gatewayId",
    ),
    instanceId: requiredString(
      pick(payload, "instance_id", "instanceId"),
      "instance.instanceId",
    ),
    lifecycleState:
      (requiredString(
        pick(payload, "lifecycle_state", "lifecycleState"),
        "instance.lifecycleState",
      ) as GatewayInstanceLifecycleState) ?? "Provisioned",
    initializedAt:
      pick(payload, "initialized_at", "initializedAt") === null ||
      pick(payload, "initialized_at", "initializedAt") === undefined
        ? null
        : String(pick(payload, "initialized_at", "initializedAt")),
    createdAt: requiredString(
      pick(payload, "created_at", "createdAt"),
      "instance.createdAt",
    ),
    initUrl:
      rawInitUrl === null || rawInitUrl === undefined
        ? undefined
        : String(rawInitUrl),
  };
}

function normalizeGatewayCustomerBinding(payload: any): GatewayCustomerBinding {
  // 返回体是 { binding: {...} }；直接给顶层对象时也接受（去外层包装后的形状）。
  const binding = payload?.binding ?? payload;
  return {
    gatewayId: requiredString(
      pick(binding, "gateway_id", "gatewayId"),
      "binding.gatewayId",
    ),
    customerId: requiredString(
      pick(binding, "customer_id", "customerId"),
      "binding.customerId",
    ),
    status: requiredString(pick(binding, "status"), "binding.status"),
    boundAt: requiredString(
      pick(binding, "bound_at", "boundAt"),
      "binding.boundAt",
    ),
  };
}

function normalizeGatewayInitialConfig(payload: any): GatewayInitialConfig {
  // 返回体是 { config: {...} }；直接给顶层对象时也接受（去外层包装后的形状）。
  const config = payload?.config ?? payload;
  return {
    gatewayId: requiredString(
      pick(config, "gateway_id", "gatewayId"),
      "config.gatewayId",
    ),
    controlCenterEndpoint: requiredString(
      pick(config, "control_center_endpoint", "controlCenterEndpoint"),
      "config.controlCenterEndpoint",
    ),
    protocolVersion: requiredString(
      pick(config, "protocol_version", "protocolVersion"),
      "config.protocolVersion",
    ),
    serverTlsRequired:
      pick(config, "server_tls_required", "serverTlsRequired") === true,
    enrollmentTokenId: requiredString(
      pick(config, "enrollment_token_id", "enrollmentTokenId"),
      "config.enrollmentTokenId",
    ),
  };
}

function normalizeReleaseArtifact(payload: any): ReleaseArtifact {
  return {
    platform: nullableString(payload, "platform"),
    sha256: optionalString(pick(payload, "sha256")) ?? "",
    source: requiredString(pick(payload, "source"), "artifact.source"),
  };
}

function normalizePackage(payload: any): ReleasePackage {
  const rawArtifacts = pick(payload, "artifacts");
  return {
    component: optionalString(pick(payload, "component")) ?? "",
    version: requiredString(payload.version, "release.version"),
    artifacts: Array.isArray(rawArtifacts)
      ? rawArtifacts.map(normalizeReleaseArtifact)
      : [],
    status: requiredString(payload.status, "release.status"),
    publishedAt: requiredString(
      pick(payload, "published_at", "publishedAt"),
      "release.publishedAt",
    ),
  };
}

function normalizeRolloutPhase(payload: any): RolloutPhase {
  const raw = pick(payload, "target_ids", "targetIds");
  return {
    phaseIndex: requiredNumber(
      pick(payload, "phase_index", "phaseIndex"),
      "phase.phaseIndex",
    ),
    targetIds: Array.isArray(raw) ? (raw as string[]) : [],
    advanceRule: requiredString(
      pick(payload, "advance_rule", "advanceRule"),
      "phase.advanceRule",
    ),
    status: requiredString(payload.status, "phase.status"),
  };
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeRolloutPlan(payload: any): RolloutPlan {
  const rawPhases = pick(payload, "phases");
  return {
    planId: requiredString(pick(payload, "plan_id", "planId"), "plan.planId"),
    action: requiredString(payload.action, "plan.action"),
    spec: requiredString(payload.spec, "plan.spec"),
    deadlineAt: optionalString(pick(payload, "deadline_at", "deadlineAt")),
    timeoutSeconds: requiredNumber(
      pick(payload, "timeout_seconds", "timeoutSeconds"),
      "plan.timeoutSeconds",
    ),
    phases: Array.isArray(rawPhases) ? rawPhases.map(normalizeRolloutPhase) : [],
    batchSize: requiredNumber(
      pick(payload, "batch_size", "batchSize"),
      "plan.batchSize",
    ),
    currentPhase: requiredNumber(
      pick(payload, "current_phase", "currentPhase"),
      "plan.currentPhase",
    ),
    status: requiredString(payload.status, "plan.status"),
    createdBy: requiredString(
      pick(payload, "created_by", "createdBy"),
      "plan.createdBy",
    ),
    createdAt: requiredString(
      pick(payload, "created_at", "createdAt"),
      "plan.createdAt",
    ),
    approvedBy: optionalString(pick(payload, "approved_by", "approvedBy")),
    approvedAt: optionalString(pick(payload, "approved_at", "approvedAt")),
  };
}

function normalizeRolloutEntry(payload: any): RolloutPlanEntry {
  return {
    targetId: requiredString(
      pick(payload, "target_id", "targetId"),
      "entry.targetId",
    ),
    workId: optionalString(pick(payload, "work_id", "workId")),
    status: requiredString(payload.status, "entry.status"),
    detail: optionalString(payload.detail) ?? "",
    updatedAt: requiredString(
      pick(payload, "updated_at", "updatedAt"),
      "entry.updatedAt",
    ),
  };
}

function normalizeRolloutPlanDetail(payload: any): RolloutPlanDetail {
  const rawEntries = pick(payload, "entries");
  return {
    plan: normalizeRolloutPlan(payload?.plan ?? payload),
    entries: Array.isArray(rawEntries)
      ? rawEntries.map(normalizeRolloutEntry)
      : [],
  };
}

// ── example 数据 ──

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** 富化字段的空值（示例数据用：老后端不带这些）。 */
const NO_GATEWAY_EXTRAS = {
  publicBaseUrl: null,
  uptimeSeconds: null,
  agentCount: null,
  onlineAgents: null,
  offlineAgents: null,
  lastSeenLagSeconds: null,
  storeBytes: null,
  ingestAcceptedTotal: null,
  ingestRejectedTotal: null,
  lastIngestAt: null,
  memoryTotalBytes: null,
  load1m: null,
  load5m: null,
  load15m: null,
  diskUsagePercent: null,
  diskTotalBytes: null,
  diskAvailableBytes: null,
};

function exampleGatewayStatusView(): GatewayStatusView[] {
  return [
    {
      gatewayId: "gw-001",
      instanceId: "inst-7f2a",
      version: "v2.4.1",
      status: "online",
      health: "healthy",
      memoryBytes: 2 * 1024 ** 3,
      cpuPercent: 35,
      lastSeenAt: isoMinutesAgo(1),
      ...NO_GATEWAY_EXTRAS,
    },
    {
      gatewayId: "gw-002",
      instanceId: "inst-9c31",
      version: "v2.4.1",
      status: "online",
      health: "degraded",
      memoryBytes: 1536 * 1024 ** 2,
      cpuPercent: 68,
      lastSeenAt: isoMinutesAgo(4),
      ...NO_GATEWAY_EXTRAS,
    },
    {
      gatewayId: "gw-003",
      instanceId: "inst-1d8b",
      version: "v2.3.0",
      status: "offline",
      health: "unhealthy",
      memoryBytes: 768 * 1024 ** 2,
      cpuPercent: 12,
      lastSeenAt: isoMinutesAgo(138),
      ...NO_GATEWAY_EXTRAS,
    },
    {
      gatewayId: "gw-004",
      instanceId: "inst-4e77",
      version: "v2.4.0",
      status: "online",
      health: "healthy",
      memoryBytes: 2 * 1024 ** 3,
      cpuPercent: 41,
      lastSeenAt: isoMinutesAgo(2),
      ...NO_GATEWAY_EXTRAS,
    },
    {
      gatewayId: "gw-005",
      instanceId: "inst-aa21",
      version: "v2.2.2",
      status: "offline",
      health: "unhealthy",
      memoryBytes: 512 * 1024 ** 2,
      cpuPercent: 5,
      lastSeenAt: isoMinutesAgo(420),
      ...NO_GATEWAY_EXTRAS,
    },
    {
      gatewayId: "gw-006",
      instanceId: "inst-38c4",
      version: "v2.4.1",
      status: "online",
      health: "healthy",
      memoryBytes: 2 * 1024 ** 3,
      cpuPercent: 28,
      lastSeenAt: isoMinutesAgo(0),
      ...NO_GATEWAY_EXTRAS,
    },
  ];
}

function exampleGatewayListView(): GatewayListView {
  return {
    gatewayCount: 6,
    onlineCount: 4,
    degradedCount: 1,
    offlineCount: 2,
    updatedAt: new Date().toISOString(),
  };
}

// 每个网关稳定的示例在线率（0.5~0.99，由 gateway_id 派生）。
function exampleGatewayUptime(
  gatewayId: string,
  window: string,
): GatewayUptime {
  let hash = 0;
  for (const ch of gatewayId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const uptime = 0.5 + (hash % 50) / 100;
  return { gatewayId, window, uptime };
}

function normalizeGatewayUptime(
  payload: any,
  fallbackGatewayId: string,
  fallbackWindow: string,
): GatewayUptime {
  return {
    gatewayId:
      requiredString(
        pick(payload, "gateway_id", "gatewayId"),
        "uptime.gatewayId",
      ) || fallbackGatewayId,
    window:
      requiredString(pick(payload, "window"), "uptime.window") ||
      fallbackWindow,
    uptime: typeof payload.uptime === "number" ? payload.uptime : null,
  };
}

function exampleGatewayHistory(
  gatewayId: string,
  window: string,
): GatewayHistory {
  let hash = 0;
  for (const ch of gatewayId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const stepSeconds = window === "24h" ? 900 : window === "6h" ? 300 : 60;
  const pointCount = Math.floor(
    (window === "24h" ? 86_400 : window === "6h" ? 21_600 : 3_600) /
      stepSeconds,
  );
  const end = Math.floor(Date.now() / stepSeconds / 1000) * stepSeconds;
  const baseMemory = (1.4 + (hash % 8) / 10) * 1024 ** 3;
  const samples = Array.from({ length: pointCount + 1 }, (_, index) => {
    const phase = (index + (hash % 17)) / 6;
    const agentCount = 3 + (hash % 5);
    const offlineAgents = index === Math.floor(pointCount * 0.28) ? 1 : 0;
    return {
      at: end - (pointCount - index) * stepSeconds,
      online: index === Math.floor(pointCount * 0.28) ? 0 : 1,
      memoryBytes: baseMemory + Math.sin(phase * 0.7) * 110 * 1024 ** 2,
      cpuPercent: 34 + Math.sin(phase) * 11 + Math.cos(phase * 0.35) * 5,
      uptimeSeconds: (index + 1) * stepSeconds,
      agentCount,
      onlineAgents: agentCount - offlineAgents,
      offlineAgents,
      lastSeenLagSeconds: 1 + Math.round(Math.abs(Math.sin(phase * 0.5)) * 4),
      storeBytes: 900 * 1024 ** 2 + Math.sin(phase * 0.4) * 120 * 1024 ** 2,
      load1m: 1.2 + Math.sin(phase * 0.6) * 0.8,
      diskUsagePercent: 58 + Math.sin(phase * 0.2) * 6,
    };
  });
  return { gatewayId, window, stepSeconds, samples };
}

function normalizeGatewayHistory(
  payload: unknown,
  fallbackGatewayId: string,
  fallbackWindow: string,
): GatewayHistory {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const rawSamples = pick(record, "samples");
  const samples = Array.isArray(rawSamples)
    ? rawSamples.map((sample, index): GatewayHistorySample => {
        const item =
          typeof sample === "object" && sample !== null
            ? (sample as Record<string, unknown>)
            : {};
        return {
          at: requiredNumber(pick(item, "at"), `history.samples[${index}].at`),
          online: nullableNumber(item, "online"),
          memoryBytes: nullableNumber(item, "memory_bytes", "memoryBytes"),
          cpuPercent: nullableNumber(item, "cpu_percent", "cpuPercent"),
          uptimeSeconds: nullableNumber(item, "uptime_seconds", "uptimeSeconds"),
          agentCount: nullableNumber(item, "agent_count", "agentCount"),
          onlineAgents: nullableNumber(item, "online_agents", "onlineAgents"),
          offlineAgents: nullableNumber(item, "offline_agents", "offlineAgents"),
          lastSeenLagSeconds: nullableNumber(
            item,
            "last_seen_lag_seconds",
            "lastSeenLagSeconds",
          ),
          storeBytes: nullableNumber(item, "store_bytes", "storeBytes"),
          load1m: nullableNumber(item, "load_1m", "load1m"),
          diskUsagePercent: nullableNumber(
            item,
            "disk_usage_percent",
            "diskUsagePercent",
          ),
        };
      })
    : [];
  return {
    gatewayId:
      requiredString(
        pick(record, "gateway_id", "gatewayId"),
        "history.gatewayId",
      ) || fallbackGatewayId,
    window:
      requiredString(pick(record, "window"), "history.window") ||
      fallbackWindow,
    stepSeconds: requiredNumber(
      pick(record, "step_seconds", "stepSeconds"),
      "history.stepSeconds",
    ),
    samples,
  };
}

function exampleAgentHistory(
  gatewayId: string,
  agentId: string,
  window: string,
): AgentHistory {
  let hash = 0;
  for (const ch of agentId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const stepSeconds = window === "24h" ? 900 : window === "6h" ? 300 : 60;
  const pointCount = Math.floor(
    (window === "24h" ? 86_400 : window === "6h" ? 21_600 : 3_600) /
      stepSeconds,
  );
  const end = Math.floor(Date.now() / stepSeconds / 1000) * stepSeconds;
  const samples = Array.from({ length: pointCount + 1 }, (_, index) => {
    const phase = (index + (hash % 19)) / 5;
    return {
      at: end - (pointCount - index) * stepSeconds,
      online: index === Math.floor(pointCount * 0.42) && hash % 3 === 0 ? 0 : 1,
      memoryBytes:
        (0.3 + (hash % 5) / 10) * 1024 ** 3 +
        Math.sin(phase * 0.65) * 32 * 1024 ** 2,
      cpuPercent: 24 + Math.sin(phase) * 15 + Math.cos(phase * 0.32) * 6,
      adminLatencyMs: 8 + Math.round(Math.abs(Math.sin(phase * 0.8)) * 9),
    };
  });
  return { agentId, gatewayId, window, stepSeconds, samples };
}

function normalizeAgentHistory(
  payload: unknown,
  fallbackGatewayId: string,
  fallbackAgentId: string,
  fallbackWindow: string,
): AgentHistory {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const rawSamples = pick(record, "samples");
  const samples = Array.isArray(rawSamples)
    ? rawSamples.map((sample, index): AgentHistorySample => {
        const item =
          typeof sample === "object" && sample !== null
            ? (sample as Record<string, unknown>)
            : {};
        return {
          at: requiredNumber(pick(item, "at"), `history.samples[${index}].at`),
          online: nullableNumber(item, "online"),
          memoryBytes: nullableNumber(item, "memory_bytes", "memoryBytes"),
          cpuPercent: nullableNumber(item, "cpu_percent", "cpuPercent"),
          adminLatencyMs: nullableNumber(
            item,
            "admin_latency_ms",
            "adminLatencyMs",
          ),
        };
      })
    : [];
  return {
    gatewayId:
      requiredString(
        pick(record, "gateway_id", "gatewayId"),
        "history.gatewayId",
      ) || fallbackGatewayId,
    agentId:
      requiredString(pick(record, "agent_id", "agentId"), "history.agentId") ||
      fallbackAgentId,
    window:
      requiredString(pick(record, "window"), "history.window") ||
      fallbackWindow,
    stepSeconds: requiredNumber(
      pick(record, "step_seconds", "stepSeconds"),
      "history.stepSeconds",
    ),
    samples,
  };
}

function normalizeLifecycleEvent(payload: any): LifecycleEvent {
  return {
    gatewayId: requiredString(
      pick(payload, "gateway_id", "gatewayId"),
      "lifecycle.gatewayId",
    ),
    fromState:
      (payload.from_state as GatewayInstanceLifecycleState) ??
      (payload.fromState as GatewayInstanceLifecycleState) ??
      null,
    toState: requiredString(
      pick(payload, "to_state", "toState"),
      "lifecycle.toState",
    ) as GatewayInstanceLifecycleState,
    at: requiredString(pick(payload, "at"), "lifecycle.at"),
  };
}

function exampleGatewayLifecycle(gatewayId: string): LifecycleEvent[] {
  return [
    {
      gatewayId,
      fromState: null,
      toState: "Provisioned",
      at: isoMinutesAgo(60 * 24 * 2),
    },
    {
      gatewayId,
      fromState: "Provisioned",
      toState: "Initializing",
      at: isoMinutesAgo(30),
    },
    {
      gatewayId,
      fromState: "Initializing",
      toState: "Running",
      at: isoMinutesAgo(5),
    },
  ];
}

function normalizeAgentStatusView(payload: any): AgentStatusView {
  return {
    agentId: requiredString(
      pick(payload, "agent_id", "agentId"),
      "agent.agentId",
    ),
    instanceId: requiredString(
      pick(payload, "instance_id", "instanceId"),
      "agent.instanceId",
    ),
    version: requiredString(payload.version, "agent.version"),
    status: requiredString(payload.status, "agent.status") as GatewayStatus,
    health: requiredString(payload.health, "agent.health") as GatewayHealth,
    memoryBytes: nullableNumber(payload, "memory_bytes", "memoryBytes"),
    cpuPercent: nullableNumber(payload, "cpu_percent", "cpuPercent"),
    adminLatencyMs: nullableNumber(
      payload,
      "admin_latency_ms",
      "adminLatencyMs",
    ),
    lastSeenAt: requiredString(
      pick(payload, "last_seen_at", "lastSeenAt"),
      "agent.lastSeenAt",
    ),
  };
}

function exampleAgentStatus(gatewayId: string): AgentStatusView[] {
  return [
    {
      agentId: `${gatewayId}-agent-1`,
      instanceId: `inst-${gatewayId}-a1`,
      version: "v0.3.2",
      status: "online",
      health: "healthy",
      memoryBytes: 512 * 1024 * 1024,
      cpuPercent: 20,
      adminLatencyMs: 8,
      lastSeenAt: isoMinutesAgo(0),
    },
    {
      agentId: `${gatewayId}-agent-2`,
      instanceId: `inst-${gatewayId}-a2`,
      version: "v0.3.0",
      status: "online",
      health: "degraded",
      memoryBytes: 384 * 1024 * 1024,
      cpuPercent: 45,
      adminLatencyMs: 15,
      lastSeenAt: isoMinutesAgo(1),
    },
  ];
}

function exampleGatewayInstance(
  command: CreateGatewayInstanceCommand,
): AdminCreateGatewayInstanceReturned {
  const gatewayId = command.gatewayName.trim();
  return {
    instance: {
      gatewayId,
      instanceId: `inst-${Math.random().toString(36).slice(2, 6)}`,
      lifecycleState: "Provisioned",
      createdAt: new Date().toISOString(),
      initializedAt: null,
    },
  };
}

function exampleBinding(
  command: BindGatewayCustomerCommand,
): GatewayCustomerBinding {
  return {
    gatewayId: command.gatewayId,
    customerId: command.customerId,
    status: "bound",
    boundAt: new Date().toISOString(),
  };
}

function exampleInitialConfig(
  command: GetGatewayInitialConfigCommand,
): GatewayInitialConfig {
  return {
    gatewayId: command.gatewayId,
    controlCenterEndpoint: "https://center.example.com",
    protocolVersion: "1.0",
    serverTlsRequired: true,
    enrollmentTokenId: "ent-example",
  };
}

function exampleUpgradePlan(command: CreateUpgradePlanCommand): RolloutPlan {
  // 离线示例：按与服务端**同一套**阶梯口径（权威在 `wist-release::rollout`）算出阶段，
  // 免得演示数据与真实回执长得不一样。
  const { phases } = planPhases(command.targetIds, command.phaseCount);
  return {
    planId: `plan-${Math.random().toString(36).slice(2, 8)}`,
    action: command.action,
    spec: command.spec,
    deadlineAt: command.deadlineAt,
    timeoutSeconds: command.timeoutSeconds,
    phases: phases.map((phase, index) => ({
      phaseIndex: phase.index,
      targetIds: phase.targetIds,
      advanceRule: index === 0 ? "manual" : "all_succeeded",
      status: "pending",
    })),
    batchSize: command.batchSize,
    currentPhase: 0,
    status: "draft",
    createdBy: "admin",
    createdAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
  };
}

/** 示例：批准/推进后的计划形状（离线演示用，字段尽量真实）。 */
function examplePlanRef(
  command: PlanRefCommand,
  status: string,
  currentPhase: number,
): RolloutPlan {
  return {
    planId: command.planId,
    action: "upgrade",
    spec: "{\"targets\":[]}",
    deadlineAt: null,
    timeoutSeconds: 0,
    phases: [],
    batchSize: 0,
    currentPhase,
    status,
    createdBy: "admin",
    createdAt: new Date().toISOString(),
    approvedBy: "admin",
    approvedAt: new Date().toISOString(),
  };
}

// ── 接口调用 ──

export async function fetchGatewayStatusView(): Promise<
  ExampleResult<GatewayStatusView[]>
> {
  return fetchOrFallback(
    "/api/v1/admin/gateways/status",
    exampleGatewayStatusView,
  ).then(async (result) => {
    if (result.source !== "real") return result;
    const raw = result.data as any;
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.statuses)
        ? raw.statuses
        : Array.isArray(raw?.gateways)
          ? raw.gateways
          : raw?.status
            ? [raw.status]
            : [];
    return { ...result, data: items.map(normalizeGatewayStatusView) };
  });
}

export async function fetchGatewayList(): Promise<
  ExampleResult<GatewayListView>
> {
  return fetchOrFallback("/api/v1/admin/gateways", exampleGatewayListView).then(
    async (result) => {
      if (result.source !== "real") return result;
      const raw = result.data as any;
      return {
        ...result,
        data: normalizeGatewayListView(raw?.list ?? raw),
      };
    },
  );
}

export async function fetchGatewayInstances(): Promise<
  ExampleResult<GatewayInstance[]>
> {
  return fetchOrFallback(
    "/api/v1/admin/gateways/instances",
    exampleGatewayInstances,
  ).then(async (result) => {
    if (result.source !== "real") return result;
    const raw = result.data as any;
    const items = Array.isArray(raw) ? raw : [];
    return { ...result, data: items.map(normalizeGatewayInstance) };
  });
}

function exampleGatewayInstances(): GatewayInstance[] {
  const now = new Date().toISOString();
  return [
    {
      gatewayId: "gw-001",
      instanceId: "inst-7f2a",
      lifecycleState: "Running",
      createdAt: now,
      initializedAt: now,
      initUrl:
        "https://127.0.0.1:3100/api/v1/gateway/link-upstream?gateway_id=gw-001",
    },
    {
      gatewayId: "gw-002",
      instanceId: "inst-9c31",
      lifecycleState: "Initializing",
      createdAt: now,
      initializedAt: null,
      initUrl:
        "https://127.0.0.1:3100/api/v1/gateway/link-upstream?gateway_id=gw-002",
    },
    {
      gatewayId: "gw-003",
      instanceId: "inst-1d8b",
      lifecycleState: "Provisioned",
      createdAt: now,
      initializedAt: null,
      initUrl:
        "https://127.0.0.1:3100/api/v1/gateway/link-upstream?gateway_id=gw-003",
    },
    {
      gatewayId: "gw-004",
      instanceId: "inst-4e77",
      lifecycleState: "Failed",
      createdAt: now,
      initializedAt: null,
      initUrl:
        "https://127.0.0.1:3100/api/v1/gateway/link-upstream?gateway_id=gw-004",
    },
  ];
}

export async function fetchGatewayUptime(
  gatewayId: string,
  window = "1h",
): Promise<ExampleResult<GatewayUptime>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(
    gatewayId,
  )}/status/uptime?window=${encodeURIComponent(window)}`;
  return fetchOrFallback(path, () =>
    exampleGatewayUptime(gatewayId, window),
  ).then(async (result) => {
    if (result.source !== "real") return result;
    return {
      ...result,
      data: normalizeGatewayUptime(result.data as any, gatewayId, window),
    };
  });
}

/** 获取网关历史趋势；请求失败时返回稳定的示例序列供独立前端演示。 */
export async function fetchGatewayHistory(
  gatewayId: string,
  window = "1h",
): Promise<ExampleResult<GatewayHistory>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(
    gatewayId,
  )}/status/history?window=${encodeURIComponent(window)}`;
  return fetchOrFallback(path, () =>
    exampleGatewayHistory(gatewayId, window),
  ).then(async (result) => {
    if (result.source !== "real") return result;
    return {
      ...result,
      data: normalizeGatewayHistory(result.data, gatewayId, window),
    };
  });
}

/** 获取单个 Agent 的历史趋势；没有真实数据时回退为稳定示例序列。 */
export async function fetchAgentHistory(
  gatewayId: string,
  agentId: string,
  window = "1h",
): Promise<ExampleResult<AgentHistory>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(
    gatewayId,
  )}/agents/${encodeURIComponent(agentId)}/history?window=${encodeURIComponent(
    window,
  )}`;
  return fetchOrFallback(path, () =>
    exampleAgentHistory(gatewayId, agentId, window),
  ).then(async (result) => {
    if (result.source !== "real") return result;
    return {
      ...result,
      data: normalizeAgentHistory(result.data, gatewayId, agentId, window),
    };
  });
}

export async function fetchGatewayAgents(
  gatewayId: string,
): Promise<ExampleResult<AgentStatusView[]>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(gatewayId)}/agents`;
  return fetchOrFallback(path, () => exampleAgentStatus(gatewayId)).then(
    async (result) => {
      if (result.source !== "real") return result;
      const raw = result.data as any;
      const items = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.agents)
          ? raw.agents
          : [];
      return { ...result, data: items.map(normalizeAgentStatusView) };
    },
  );
}

export async function fetchGatewayLifecycle(
  gatewayId: string,
): Promise<ExampleResult<LifecycleEvent[]>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(gatewayId)}/lifecycle`;
  return fetchOrFallback(path, () => exampleGatewayLifecycle(gatewayId)).then(
    async (result) => {
      if (result.source !== "real") return result;
      const raw = result.data as any;
      const items = Array.isArray(raw) ? raw : [];
      return { ...result, data: items.map(normalizeLifecycleEvent) };
    },
  );
}

export async function fetchGatewayStatus(
  gatewayId: string,
): Promise<ExampleResult<GatewayStatusView | null>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(gatewayId)}/status`;
  return fetchOrFallback(path, () => null).then(async (result) => {
    if (result.source !== "real") return result;
    const raw = result.data as any;
    const item = raw?.status ?? raw;
    return { ...result, data: item ? normalizeGatewayStatusView(item) : null };
  });
}

export async function createGatewayInstance(
  command: CreateGatewayInstanceCommand,
): Promise<ExampleResult<AdminCreateGatewayInstanceReturned>> {
  return fetchOrFallback(
    "/api/v1/admin/gateways/instances",
    () => exampleGatewayInstance(command),
    {
      method: "POST",
      body: JSON.stringify({
        gateway_name: command.gatewayName,
        requested_by: command.requestedBy,
      }),
    },
  ).then(async (result) => {
    if (result.source === "real") {
      const raw = result.data as any;
      return {
        ...result,
        data: {
          instance: normalizeGatewayInstance(raw.instance ?? raw),
        },
      };
    }
    return result;
  });
}

export async function rotateGatewayLinkToken(
  command: RotateGatewayLinkTokenCommand,
): Promise<ExampleResult<AdminRotateGatewayLinkTokenReturned>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(command.gatewayId)}/link-token`;
  // **刻意不回落示例**：这里签发的是真实凭据（一次性接入券 + CA）。示例券会伪装成真接入物
  // ——曾因此让「示例实例」页生成出一条看似可用、实则 http/无 CA 的链接。真实失败就让它冒出来。
  const raw = (await requestJson<any>(path, {
    method: "POST",
    body: JSON.stringify({ requested_by: command.requestedBy }),
  })) as any;
  return {
    source: "real",
    data: {
      gatewayId: String(raw.gateway_id ?? command.gatewayId),
      install: normalizeGatewayInstallInfo(raw.install ?? {}),
      linkExpiresAt:
        raw.link_expires_at == null ? null : String(raw.link_expires_at),
    },
  };
}

export async function bindGatewayCustomer(
  command: BindGatewayCustomerCommand,
): Promise<ExampleResult<GatewayCustomerBinding>> {
  return fetchOrFallback(
    "/api/v1/admin/gateways/bind",
    () => exampleBinding(command),
    {
      method: "POST",
      body: JSON.stringify({
        gateway_id: command.gatewayId,
        customer_id: command.customerId,
        requested_by: command.requestedBy,
      }),
    },
  ).then(async (result) => {
    if (result.source === "real") {
      return { ...result, data: normalizeGatewayCustomerBinding(result.data) };
    }
    return result;
  });
}

export async function fetchGatewayInitialConfig(
  command: GetGatewayInitialConfigCommand,
): Promise<ExampleResult<GatewayInitialConfig>> {
  const path = `/api/v1/admin/gateways/${encodeURIComponent(command.gatewayId)}/config`;
  return fetchOrFallback(path, () => exampleInitialConfig(command)).then(
    async (result) => {
      if (result.source === "real") {
        return { ...result, data: normalizeGatewayInitialConfig(result.data) };
      }
      return result;
    },
  );
}

export async function fetchReleases(
  component: string,
): Promise<ExampleResult<ReleasePackage[]>> {
  const path = `/api/v1/admin/releases/${encodeURIComponent(component)}`;
  return fetchOrFallback(path, () => exampleReleases(component)).then(
    async (result) => {
      if (result.source !== "real") return result;
      const raw = result.data as any;
      const items = Array.isArray(raw) ? raw : [];
      return { ...result, data: items.map(normalizePackage) };
    },
  );
}

function exampleReleases(component: string): ReleasePackage[] {
  return [
    {
      component,
      version: "v2.4.1",
      artifacts: [
        {
          platform: "x86_64-unknown-linux-musl",
          sha256: "0".repeat(64),
          source: `http://127.0.0.1:3100/api/v1/releases/artifact/${component}/v2.4.1/${component}-v2.4.1-x86_64-unknown-linux-musl.tar.gz`,
        },
      ],
      status: "published",
      publishedAt: new Date().toISOString(),
    },
  ];
}

/**
 * 发布/提交某组件的新版本（中心把制品镜像到本地并落库）。
 *
 * **刻意不回落示例**：这是**写操作**，示例回执会把「其实没提交成功」伪装成一张成功卡
 * （曾把一个 422 掩盖成回执）—— 与 `rotateGatewayLinkToken` 同一取舍。真实失败就让它冒出来。
 */
export async function publishRelease(
  component: string,
  command: PublishReleaseCommand,
): Promise<ExampleResult<ReleasePackage>> {
  const raw = await requestJson<any>(
    `/api/v1/admin/releases/${encodeURIComponent(component)}`,
    {
      method: "POST",
      body: JSON.stringify({
        version: command.version?.trim() || undefined,
        artifact_url: command.artifactUrl,
        expected_sha256: command.expectedSha256.trim(),
        requested_by: command.requestedBy,
      }),
    },
  );
  return { source: "real", data: normalizePackage(raw) };
}

/** 托管状态取值：`published`（在用）/ `expired`（已过期）。 */
export type ReleaseStatus = "published" | "expired";

/**
 * 改某版本的托管状态（如把旧版本标为 `expired`）。
 *
 * **刻意不回落示例**：写操作，失败就让它冒出来（与 `publishRelease` 同取舍）。
 */
export async function setReleaseStatus(
  component: string,
  version: string,
  status: ReleaseStatus,
): Promise<ExampleResult<ReleasePackage>> {
  const raw = await requestJson<any>(
    `/api/v1/admin/releases/${encodeURIComponent(component)}/${encodeURIComponent(version)}/status`,
    { method: "POST", body: JSON.stringify({ status }) },
  );
  return { source: "real", data: normalizePackage(raw) };
}

/** 多平台批量录入的单个制品（平台由中心从包自身解析，不由前端声明）。 */
export interface BatchReleaseArtifact {
  artifactUrl: string;
  expectedSha256: string;
}

export interface PublishReleaseBatchCommand {
  requestedBy: string;
  artifacts: BatchReleaseArtifact[];
}

/**
 * 一次录入**同一版本**的多个平台制品（galaxy-ops / galaxy-flow 必须 macOS-ARM / Linux-ARM /
 * Linux-X86 三平台齐备）。中心先全部下载校验，任一不合格即整体拒绝。
 *
 * **刻意不回落示例**：写操作，失败要冒出来（与 `publishRelease` 同取舍）。
 */
export async function publishReleaseBatch(
  component: string,
  command: PublishReleaseBatchCommand,
): Promise<ExampleResult<ReleasePackage>> {
  const raw = await requestJson<any>(
    `/api/v1/admin/releases/${encodeURIComponent(component)}/batch`,
    {
      method: "POST",
      body: JSON.stringify({
        requested_by: command.requestedBy,
        artifacts: command.artifacts.map((artifact) => ({
          artifact_url: artifact.artifactUrl,
          expected_sha256: artifact.expectedSha256,
        })),
      }),
    },
  );
  // 中心回**一个安装包**（version + 多平台 artifacts），不是制品数组。
  return { source: "real", data: normalizePackage(raw) };
}

/** GitHub Release 里的一个资产（含平台槽位与 sha256）。 */
export interface ResolvedGitHubAsset {
  name: string;
  artifactUrl: string;
  sha256: string | null;
  platform: string | null;
}

export interface ResolvedGitHubRelease {
  version: string;
  assets: ResolvedGitHubAsset[];
}

/**
 * 解析 GitHub Release 页面地址：拉出 tag（版本）与各平台制品地址（含 sha256），供录入页一键填充。
 *
 * **刻意不回落示例**：这是解析请求，失败要冒出来。
 */
export async function resolveGitHubRelease(
  releaseUrl: string,
): Promise<ResolvedGitHubRelease> {
  const raw = await requestJson<any>("/api/v1/admin/github-release/resolve", {
    method: "POST",
    body: JSON.stringify({ release_url: releaseUrl }),
  });
  const assets = Array.isArray(raw?.assets) ? raw.assets : [];
  return {
    version: typeof raw?.version === "string" ? raw.version : "",
    assets: assets.map((asset: any) => ({
      name: String(asset?.name ?? ""),
      artifactUrl: String(asset?.artifact_url ?? asset?.artifactUrl ?? ""),
      sha256: typeof asset?.sha256 === "string" ? asset.sha256 : null,
      platform: typeof asset?.platform === "string" ? asset.platform : null,
    })),
  };
}

export async function fetchUpgradePlans(): Promise<
  ExampleResult<RolloutPlan[]>
> {
  return fetchOrFallback(
    "/api/v1/admin/rollout-plans",
    exampleUpgradePlans,
  ).then(async (result) => {
    if (result.source !== "real") return result;
    const raw = result.data as any;
    const items = Array.isArray(raw) ? raw : [];
    return { ...result, data: items.map(normalizeRolloutPlan) };
  });
}

/** 查看一份计划及其逐目标进度（`ViewRolloutPlan`）。 */
export async function fetchUpgradePlan(
  planId: string,
): Promise<ExampleResult<RolloutPlanDetail>> {
  const path = `/api/v1/admin/rollout-plans/${encodeURIComponent(planId)}`;
  return fetchOrFallback(path, () => exampleRolloutPlanDetail(planId)).then(
    async (result) => {
      if (result.source !== "real") return result;
      return { ...result, data: normalizeRolloutPlanDetail(result.data) };
    },
  );
}

function exampleUpgradePlans(): RolloutPlan[] {
  return [
    {
      planId: "plan-example-1",
      action: "upgrade",
      spec: jsonUpgradeSpec([
        { component: "wist-gateway-stack", targetVersion: "0.1.28" },
      ]),
      deadlineAt: null,
      timeoutSeconds: 0,
      phases: [
        {
          phaseIndex: 1,
          targetIds: ["gw-001"],
          advanceRule: "manual",
          status: "rolling",
        },
        {
          phaseIndex: 2,
          targetIds: ["gw-002"],
          advanceRule: "all_succeeded",
          status: "pending",
        },
      ],
      batchSize: 0,
      currentPhase: 1,
      status: "rolling",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      approvedBy: "admin",
      approvedAt: new Date().toISOString(),
    },
  ];
}

function exampleRolloutPlanDetail(planId: string): RolloutPlanDetail {
  const plan = exampleUpgradePlans()[0];
  return {
    plan: { ...plan, planId },
    entries: [
      {
        targetId: "gw-001",
        workId: null,
        status: "dispatched",
        detail: "",
        updatedAt: new Date().toISOString(),
      },
      {
        targetId: "gw-002",
        workId: null,
        status: "pending",
        detail: "",
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export async function createUpgradePlan(
  command: CreateUpgradePlanCommand,
): Promise<ExampleResult<RolloutPlan>> {
  return fetchOrFallback(
    "/api/v1/admin/rollout-plans",
    () => exampleUpgradePlan(command),
    {
      method: "POST",
      body: JSON.stringify({
        action: command.action,
        spec: command.spec,
        target_ids: command.targetIds,
        phase_count: command.phaseCount,
        deadline_at: command.deadlineAt,
        timeout_seconds: command.timeoutSeconds,
        batch_size: command.batchSize,
      }),
    },
  ).then(async (result) => {
    if (result.source === "real") {
      return { ...result, data: normalizeRolloutPlan(result.data) };
    }
    return result;
  });
}

/** 批准计划：`draft → rolling`，进入第一阶段（`ApproveRolloutPlan`）。 */
export async function approveUpgradePlan(
  command: PlanRefCommand,
): Promise<ExampleResult<RolloutPlan>> {
  return fetchOrFallback(
    "/api/v1/admin/rollout-plans/approve",
    () => examplePlanRef(command, "rolling", 1),
    { method: "POST", body: JSON.stringify({ plan_id: command.planId }) },
  ).then(async (result) => {
    if (result.source === "real") {
      return { ...result, data: normalizeRolloutPlan(result.data) };
    }
    return result;
  });
}

/** 人工推进到下一阶段（`AdvanceRolloutPlan`）。 */
export async function advanceUpgradePlan(
  command: PlanRefCommand,
): Promise<ExampleResult<RolloutPlan>> {
  return fetchOrFallback(
    "/api/v1/admin/rollout-plans/advance",
    () => examplePlanRef(command, "rolling", 2),
    { method: "POST", body: JSON.stringify({ plan_id: command.planId }) },
  ).then(async (result) => {
    if (result.source === "real") {
      return { ...result, data: normalizeRolloutPlan(result.data) };
    }
    return result;
  });
}
