import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_AUTH_CHANGED_EVENT,
  ApiError,
  advanceUpgradePlan,
  approveUpgradePlan,
  bindGatewayCustomer,
  createGatewayInstance,
  createUpgradePlan,
  fetchBackendVersion,
  fetchGatewayAgents,
  fetchGatewayBindingHistory,
  fetchAgentHistory,
  fetchGatewayHistory,
  fetchGatewayInstances,
  fetchGatewayLifecycle,
  fetchGatewayList,
  fetchGatewayInitialConfig,
  fetchGatewayStatus,
  fetchGatewayStatusView,
  fetchGatewayUpgradeScript,
  fetchGatewayUptime,
  fetchPackageLatest,
  fetchPackageSources,
  fetchReleases,
  fetchUpgradePlan,
  fetchUpgradePlans,
  fetchWparseRepos,
  fetchWparseTags,
  getAdminApiToken,
  publishRelease,
  publishReleaseBatch,
  publishWparseRelease,
  resolveCosPath,
  resolveGitHubRelease,
  retryUpgradePlan,
  rotateGatewayLinkToken,
  setGatewayArchived,
  setReleaseStatus,
  type BindGatewayCustomerCommand,
  type CreateGatewayInstanceCommand,
  type CreateUpgradePlanCommand,
  type GetGatewayInitialConfigCommand,
  type GatewayUpgradeScriptCommand,
  type PlanRefCommand,
  type PublishReleaseBatchCommand,
  type PublishReleaseCommand,
  type ReleasePackage,
  type ReleaseStatus,
  type RetryPlanCommand,
  type RotateGatewayLinkTokenCommand,
  type WparsePublishResult,
} from "../api";
import {
  enqueueGatewayDiagnose,
  enqueueGatewayRestart,
  fetchGatewayControlCommand,
  fetchLatestGatewayDiagnose,
  type GatewayControlTarget,
} from "../api";
import { isTerminalCommandState } from "../components/gatewayOps";

/**
 * 当前缓存里有多少个查询**回落到示例数据**（`source === "example"`）。
 *
 * 为什么需要它：`source` 由每个取数函数自己标（只有**非鉴权**的失败才回落，见 `fetchOrFallback`）。
 * 状态条据此说「现在是示例数据」，才不会把假机队说成真的 —— 未鉴权 / 无 token 已被内容区 gate
 * 拦在前面，不会走到这里。
 */
export function useExampleFallbackCount(): number {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const scan = () => {
      let example = 0;
      for (const query of queryClient.getQueryCache().getAll()) {
        const data = query.state.data as { source?: string } | undefined;
        if (data && typeof data === "object" && data.source === "example") {
          example += 1;
        }
      }
      setCount(example);
    };
    scan();
    return queryClient.getQueryCache().subscribe(scan);
  }, [queryClient]);
  return count;
}

// 当 Admin Token 变化时触发重渲染，使查询能立即从禁用切到启用。
function useAuthVersion() {
  const [, setAuthVersion] = useState(0);
  useEffect(() => {
    const onAuthChanged = () => setAuthVersion((version) => version + 1);
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    return () =>
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);
}

/** 订阅当前 Admin Token（token 变化时重渲染）；供内容区 gate / 状态条用。 */
export function useAdminToken(): string | null {
  const [token, setToken] = useState<string | null>(() => getAdminApiToken());
  useEffect(() => {
    const onAuthChanged = () => setToken(getAdminApiToken());
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    return () =>
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);
  return token;
}

/**
 * 缓存里是否出现了 401（缺 / 错 Admin Token）。
 *
 * **换 token 时复位**：给一次重试机会 —— 否则旧 token 的错误会一直把 gate 关着，
 * 而且错 token 在每 5~15s 的轮询下会把本机 IP 撞满限流（5 次/60s → 封 60s）。
 */
export function useAuthErrorSignal(): boolean {
  const queryClient = useQueryClient();
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const scan = () => {
      setHasError(
        queryClient
          .getQueryCache()
          .getAll()
          .some(
            (query) =>
              query.state.error instanceof ApiError &&
              query.state.error.status === 401,
          ),
      );
    };
    scan();
    const unsubscribe = queryClient.getQueryCache().subscribe(scan);
    const onAuthChanged = () => setHasError(false);
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      unsubscribe();
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [queryClient]);
  return hasError;
}

/** 网关状态视图；`includeArchived` = 把**已归档**的网关也带回来（默认隐藏）。 */
export function useGatewayStatusView(includeArchived = false) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    // 归档开关进 key：两个集合各自缓存，切回来不用重新等。
    queryKey: ["gateway-status-view", includeArchived],
    queryFn: () => fetchGatewayStatusView(includeArchived),
    // 有 token 才发（5s 轮询）；无 token **不轮询**（`false`）—— 不发就不会拿 401、更不会回落成假数据。
    refetchInterval: enabled ? 5_000 : false,
    enabled,
  });
}

export function useGatewayStatus(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-status", gatewayId],
    queryFn: () => fetchGatewayStatus(gatewayId),
    refetchInterval: enabled ? 5_000 : false,
    enabled: enabled && Boolean(gatewayId),
  });
}

/** 轮询网关历史序列；Query key 包含窗口，避免不同时间范围共享缓存。 */
export function useGatewayHistory(gatewayId: string, window = "1h") {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken()) && Boolean(gatewayId);
  return useQuery({
    queryKey: ["gateway-history", gatewayId, window],
    queryFn: () => fetchGatewayHistory(gatewayId, window),
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

/** 批量查询列表页网关历史，避免每张卡片各自创建一套 Query 生命周期。 */
export function useGatewayHistories(gatewayIds: string[], window = "1h") {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  const enabled = hasAdminToken && gatewayIds.length > 0;
  return useQuery({
    queryKey: ["gateway-histories", gatewayIds, window],
    queryFn: async () => {
      const results = await Promise.all(
        gatewayIds.map((gatewayId) => fetchGatewayHistory(gatewayId, window)),
      );
      return Object.fromEntries(
        results.map((result) => [result.data.gatewayId, result]),
      );
    },
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

/** 批量查询当前网关下 Agent 的历史，保持每个 Agent 独立缓存和错误回退。 */
export function useAgentHistories(gatewayId: string, agentIds: string[]) {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  const enabled = hasAdminToken && Boolean(gatewayId) && agentIds.length > 0;
  return useQuery({
    queryKey: ["agent-histories", gatewayId, agentIds],
    queryFn: async () => {
      const results = await Promise.all(
        agentIds.map((agentId) => fetchAgentHistory(gatewayId, agentId)),
      );
      return Object.fromEntries(
        results.map((result) => [result.data.agentId, result]),
      );
    },
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

export function useGatewayLifecycle(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-lifecycle", gatewayId],
    queryFn: () => fetchGatewayLifecycle(gatewayId),
    refetchInterval: enabled ? 10_000 : false,
    enabled: enabled && Boolean(gatewayId),
  });
}

/** 换绑审计：谁在什么时候把该网关绑到哪个客户（随实例列表一起刷新）。 */
export function useGatewayBindingHistory(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-binding-history", gatewayId],
    queryFn: () => fetchGatewayBindingHistory(gatewayId),
    refetchInterval: enabled ? 10_000 : false,
    enabled: enabled && Boolean(gatewayId),
  });
}

/** 批量查询多网关下的 Agent 状态（版本发布页展示各 Agent 当前版本）。 */
export function useGatewayAgentsForAll(gatewayIds: string[]) {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  const enabled = hasAdminToken && gatewayIds.length > 0;
  return useQuery({
    queryKey: ["all-gateway-agents", gatewayIds],
    queryFn: async () => {
      const results = await Promise.all(
        gatewayIds.map((gatewayId) => fetchGatewayAgents(gatewayId)),
      );
      return results.flatMap((result, index) =>
        (result.data ?? []).map((agent) => ({
          ...agent,
          gatewayId: gatewayIds[index],
        })),
      );
    },
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

export function useGatewayAgents(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-agents", gatewayId],
    queryFn: () => fetchGatewayAgents(gatewayId),
    refetchInterval: enabled ? 5_000 : false,
    enabled: enabled && Boolean(gatewayId),
  });
}

export function useGatewayList() {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-list"],
    queryFn: fetchGatewayList,
    refetchInterval: enabled ? 5_000 : false,
    enabled,
  });
}

/** 一次拉取多个网关的在线率，返回 { gateway_id: uptime|null } 映射（列表页用）。 */
/**
 * 自动探测最新版本（GitHub 列 releases / COS 从已知版本往后探）。
 *
 * 只在组件/基准版本/来源变化时重取；`staleTime` 内不因窗口聚焦重复探测。
 */
export function usePackageLatest(
  component: string,
  baseVersion?: string,
  source?: "github" | "cos",
) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken()) && Boolean(component);
  return useQuery({
    queryKey: ["package-latest", component, baseVersion ?? "", source ?? ""],
    queryFn: () => fetchPackageLatest(component, baseVersion, source),
    enabled,
    staleTime: 2 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * 安装包来源（配置里的 `[[packages.sources]]`）：录入页据此按版本号拼 URL。
 *
 * 静态配置（启动期读入），不轮询；没配 token 时不请求，页面自动回落到手工粘贴。
 */
export function usePackageSources() {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["package-sources"],
    queryFn: fetchPackageSources,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useReleases(component: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["releases", component],
    queryFn: () => fetchReleases(component),
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

/** 一次拉取多个组件的发布记录，返回 `{ component: 版本列表 }`（升级目标版本下拉用）。 */
export function useReleasesForComponents(components: readonly string[]): {
  /** 组件 → 已发布版本（新→旧，接口顺序）。 */
  versions: Record<string, string[]>;
  /** 有任一组件回落到**示例数据**（接口不可达 / 未鉴权）—— 调用方据此别拿假版本去建计划。 */
  source: "real" | "example";
} {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  const results = useQueries({
    queries: components.map((component) => ({
      queryKey: ["releases", component],
      queryFn: () => fetchReleases(component),
      refetchInterval: enabled ? 15_000 : false,
      enabled,
    })),
  });
  const versions: Record<string, string[]> = {};
  let source: "real" | "example" = "real";
  components.forEach((component, index) => {
    const result = results[index]?.data;
    if (result?.source === "example") source = "example";
    versions[component] = result?.data?.map((release) => release.version) ?? [];
  });
  return { versions, source };
}

/** 一条托管安装包 + 数据来源（安装包管理页汇总列表用）。 */
export interface ManagedRelease extends ReleasePackage {
  source: "real" | "example";
}

/**
 * 汇总多个组件的托管安装包，返回扁平列表（新→旧；按组件顺序归并再按时间降序）。
 *
 * 与 `useReleases` 共用 `["releases", component]` 缓存键 —— 录入 / 改状态后失效即可同步。
 */
export function useAllReleases(components: readonly string[]): {
  data: ManagedRelease[];
  isLoading: boolean;
  source: "real" | "example";
} {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  const results = useQueries({
    queries: components.map((component) => ({
      queryKey: ["releases", component],
      queryFn: () => fetchReleases(component),
      refetchInterval: enabled ? 15_000 : false,
      enabled,
    })),
  });
  const records: ManagedRelease[] = [];
  let source: "real" | "example" = "real";
  components.forEach((component, index) => {
    const result = results[index]?.data;
    if (!result) return;
    if (result.source === "example") source = "example";
    for (const release of result.data) {
      records.push({ ...release, component: release.component || component, source: result.source });
    }
  });
  records.sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime(),
  );
  return {
    data: records,
    isLoading: results.some((result) => result.isLoading),
    source,
  };
}

/** 实例总览；`includeArchived` = 把**已归档**的实例也带回来（默认隐藏，实例页的开关用这个）。 */
export function useGatewayInstances(includeArchived = false) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-instances", includeArchived],
    queryFn: () => fetchGatewayInstances(includeArchived),
    refetchInterval: enabled ? 10_000 : false,
    enabled,
  });
}

/**
 * 归档 / 取消归档一台网关；成功后刷新实例与态势两类视图 —— 归档改的正是「哪些网关该出现在
 * 默认视图里」，两处都得跟着变。
 */
export function useSetGatewayArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: { gatewayId: string; archived: boolean }) =>
      setGatewayArchived(command.gatewayId, command.archived),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gateway-instances"] });
      void queryClient.invalidateQueries({ queryKey: ["gateway-status-view"] });
      void queryClient.invalidateQueries({ queryKey: ["gateway-list"] });
    },
  });
}

export function useGatewayUptimes(gatewayIds: string[]) {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  // 有 token 才发：无 token 不发请求（也就不会拿 401、不会回落成假的在线率）。
  const enabled = hasAdminToken && gatewayIds.length > 0;
  return useQuery({
    queryKey: ["gateway-uptimes", gatewayIds],
    queryFn: async () => {
      const results = await Promise.all(
        gatewayIds.map((id) => fetchGatewayUptime(id)),
      );
      const map: Record<string, number | null> = {};
      for (const result of results) {
        map[result.data.gatewayId] = result.data.uptime;
      }
      return map;
    },
    enabled,
    refetchInterval: enabled ? 5_000 : false,
  });
}

export function useCreateGatewayInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CreateGatewayInstanceCommand) =>
      createGatewayInstance(command),
    // 创建成功后立即刷新总览，避免等待轮询周期才能看到新实例。
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["gateway-instances"] }),
  });
}

export function useBindGatewayCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: BindGatewayCustomerCommand) =>
      bindGatewayCustomer(command),
    // 绑定后列表/详情/审计都要立刻反映（否则得等 10s 轮询）。
    onSuccess: (_binding, command) => {
      void queryClient.invalidateQueries({ queryKey: ["gateway-instances"] });
      void queryClient.invalidateQueries({
        queryKey: ["gateway-binding-history", command.gatewayId],
      });
    },
  });
}

/** 生成/轮换一次性接入券（明文仅返回一次，由调用方立即展示）。 */
export function useRotateGatewayLinkToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RotateGatewayLinkTokenCommand) =>
      rotateGatewayLinkToken(command),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["gateway-instances"] }),
  });
}

export function useGatewayInitialConfig() {
  return useMutation({
    mutationFn: (command: GetGatewayInitialConfigCommand) =>
      fetchGatewayInitialConfig(command),
  });
}

export function usePublishRelease(component: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PublishReleaseCommand) =>
      publishRelease(component, command),
    // 发布成功后刷新该组件的历史，立即反馈新版本已进入发布记录。
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["releases", component] }),
  });
}

/** 多平台一次录入（galaxy-ops / galaxy-flow 三平台齐备），成功后刷新该组件历史。 */
export function usePublishReleaseBatch(component: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PublishReleaseBatchCommand) =>
      publishReleaseBatch(component, command),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["releases", component] }),
  });
}

/** 解析 GitHub Release（拉 tag + 多平台制品地址），供录入页一键填充。非写操作，不刷新缓存。 */
export function useResolveGitHubRelease() {
  return useMutation({
    mutationFn: (releaseUrl: string) => resolveGitHubRelease(releaseUrl),
  });
}

/** 解析 COS 路径（列前缀 + 读回 sha256 元数据），供录入页一键填充。非写操作，不刷新缓存。 */
export function useResolveCosPath() {
  return useMutation({
    mutationFn: (cosPath: string) => resolveCosPath(cosPath),
  });
}

/** 改某组件某版本的托管状态（published / expired），成功后刷新该组件历史。 */
export function useSetReleaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      component: string;
      version: string;
      status: ReleaseStatus;
    }) => setReleaseStatus(vars.component, vars.version, vars.status),
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: ["releases", vars.component] }),
  });
}

export function useUpgradePlans() {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["upgrade-plans"],
    queryFn: fetchUpgradePlans,
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

/** 单份计划及其逐目标进度（计划详情）。 */
export function useUpgradePlan(planId: string | null) {
  useAuthVersion();
  return useQuery({
    queryKey: ["upgrade-plan", planId],
    queryFn: () => fetchUpgradePlan(planId as string),
    enabled: Boolean(planId) && Boolean(getAdminApiToken()),
  });
}

export function useCreateUpgradePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CreateUpgradePlanCommand) =>
      createUpgradePlan(command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plans"] });
    },
  });
}

/**
 * 生成单台网关的**手动升级执行脚本**（不建计划、不下发任务）。
 *
 * 写类操作：失败要冒出来（不回落示例数据），由页面直接展示错误。
 */
export function useGatewayUpgradeScript() {
  return useMutation({
    mutationFn: (command: GatewayUpgradeScriptCommand) =>
      fetchGatewayUpgradeScript(command),
  });
}

/** 批准（进入第一阶段）与推进（下一阶段）共用一套刷新（同页相邻按钮）。 */
export function useApproveUpgradePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PlanRefCommand) => approveUpgradePlan(command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plan"] });
    },
  });
}

export function useAdvanceUpgradePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PlanRefCommand) => advanceUpgradePlan(command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plan"] });
    },
  });
}

/**
 * 重派失败目标（「重试」）：中心新建一份**补跑计划**，返回的是那份新计划。
 *
 * 成功后刷新列表与详情 —— 新计划会出现在列表里（`-retry` 结尾），页面据此说清「重派成了哪一份」。
 */
export function useRetryUpgradePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RetryPlanCommand) => retryUpgradePlan(command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plan"] });
    },
  });
}

/**
 * 中心（后端）版本（`GET /api/v1/version`）。
 *
 * 与别的查询不同，这条**不**等 admin token：端点是公开的，未登录时也要显示后端版本。
 * 版本只在中心重启后才会变，`staleTime: Infinity` 让一次会话只取一次（切窗口不重拉）。
 * 失败不刷新成示例值：拿不到就是未知，由版本块显示成 `—`。
 *
 * 注意：**不走 `fetchOrFallback`** —— 版本号绝不回落示例数据（`useExampleFallbackCount` 只看
 * `data.source === "example"`，本查询的数据是裸字符串，天然不会计入回落计数）。
 */
export function useBackendVersion() {
  return useQuery({
    queryKey: ["backend-version"],
    queryFn: fetchBackendVersion,
    staleTime: Infinity,
  });
}

// ── 网关运行时操作（体检 / 重启）──
//
// 轮询口径：后端返回的 `state` 是命令队列状态（pending → leased → done/failed/expired）。
// **只在这三个终态停**（`isTerminalCommandState`）；其它取值（老后端 / 契约漂移）继续轮询，
// 宁可能多问几次，也不能把“还在跑”提前当成“结束了”。

/** 最近一次体检（含报告）。体检在飞时每 1.5s 自动刷新。 */
export function useLatestGatewayDiagnose(gatewayId: string) {
  return useQuery({
    queryKey: ["gateway-diagnose", gatewayId],
    queryFn: () => fetchLatestGatewayDiagnose(gatewayId),
    enabled: Boolean(gatewayId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "pending" || state === "leased" ? 1500 : false;
    },
  });
}

/** 一条控制命令的状态；未到终态时每 1.5s 自动刷新。 */
export function useGatewayCommandStatus(
  gatewayId: string,
  commandId: string | null,
) {
  return useQuery({
    queryKey: ["gateway-command", gatewayId, commandId],
    queryFn: () => fetchGatewayControlCommand(gatewayId, commandId ?? ""),
    enabled: Boolean(gatewayId && commandId),
    refetchInterval: (query) =>
      isTerminalCommandState(query.state.data?.state) ? false : 1500,
  });
}

/** 下发一次体检。成功后立刻刷新「最近一次体检」（会先显示 pending）。 */
export function useRunGatewayDiagnose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gatewayId: string) => enqueueGatewayDiagnose(gatewayId),
    onSuccess: (_result, gatewayId) => {
      void queryClient.invalidateQueries({
        queryKey: ["gateway-diagnose", gatewayId],
      });
    },
  });
}

/** 下发重启（`gateway` 容器 / `gwlinkd` 宿主常驻）。 */
export function useRestartGatewayRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { gatewayId: string; target: GatewayControlTarget }) =>
      enqueueGatewayRestart(input.gatewayId, input.target),
    onSuccess: (_result, input) => {
      // 重启会换掉进程/容器：状态视图与体检记录都要重新取。
      void queryClient.invalidateQueries({
        queryKey: ["gateway-command", input.gatewayId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["gateway-status", input.gatewayId],
      });
    },
  });
}

// ── 规则 / 配置发布入口（wparse-rules / wparse-infra） ──
//
// tag 候选是读接口；发布是写接口。两者都**不回落示例数据**：候选列表为空就是没有候选，
// 发布失败必须显式报错（与体检 / 重启同一取舍）。

export function useWparseRepos() {
  return useQuery({
    queryKey: ["wparse-repos"],
    queryFn: fetchWparseRepos,
    staleTime: 60_000,
  });
}

/**
 * 某个入口的 tag 候选。
 *
 * `refresh()` 会让**下一次**请求带 `refresh=true` 绕过服务端缓存；平时走缓存（默认 60s）。
 * 用 ref 而不是 queryKey：刷新按钮不应改变缓存身份，否则页面上会留下两套 tag 列表。
 */
export function useWparseTags(repoName: string, enabled = true) {
  const refreshNext = useRef(false);
  const query = useQuery({
    queryKey: ["wparse-tags", repoName],
    queryFn: () => {
      const refresh = refreshNext.current;
      refreshNext.current = false;
      return fetchWparseTags(repoName, { refresh });
    },
    enabled: Boolean(repoName) && enabled,
    staleTime: 30_000,
  });
  return {
    ...query,
    refresh: () => {
      refreshNext.current = true;
      return query.refetch();
    },
  };
}

export function usePublishWparseRelease(repoName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      tag: string;
      gatewayIds: string[];
      reason?: string;
      verifyTag?: boolean;
    }): Promise<WparsePublishResult> => publishWparseRelease(repoName, input),
    onSuccess: () => {
      // 发布入口只**建计划**：新计划要立刻出现在「发布执行」页的待审批列表里。
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["upgrade-plan"] });
    },
  });
}
