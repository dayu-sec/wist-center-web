import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_AUTH_CHANGED_EVENT,
  advanceUpgradePlan,
  approveUpgradePlan,
  bindGatewayCustomer,
  createGatewayInstance,
  createUpgradePlan,
  fetchGatewayAgents,
  fetchAgentHistory,
  fetchGatewayHistory,
  fetchGatewayInstances,
  fetchGatewayLifecycle,
  fetchGatewayList,
  fetchGatewayInitialConfig,
  fetchGatewayStatus,
  fetchGatewayStatusView,
  fetchGatewayUptime,
  fetchReleases,
  fetchUpgradePlan,
  fetchUpgradePlans,
  getAdminApiToken,
  publishRelease,
  publishReleaseBatch,
  resolveGitHubRelease,
  retryUpgradePlan,
  rotateGatewayLinkToken,
  setGatewayArchived,
  setReleaseStatus,
  type BindGatewayCustomerCommand,
  type CreateGatewayInstanceCommand,
  type CreateUpgradePlanCommand,
  type GetGatewayInitialConfigCommand,
  type PlanRefCommand,
  type PublishReleaseBatchCommand,
  type PublishReleaseCommand,
  type ReleasePackage,
  type ReleaseStatus,
  type RetryPlanCommand,
  type RotateGatewayLinkTokenCommand,
} from "../api";

/**
 * 当前缓存里有多少个查询**回落到示例数据**（`source === "example"`）。
 *
 * 为什么需要它：`source` 是每个取数函数自己标的（接口不可达 / 未鉴权才回落），而「浏览器里有没有
 * 手填 Admin Token」并不能代表这件事（dev 代理会**在服务端**补 token，页面不带 token 也拿真数据）。
 * 状态条据此说「现在是示例数据」，才不会把假机队说成真的。
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

/** 网关状态视图；`includeArchived` = 把**已归档**的网关也带回来（默认隐藏）。 */
export function useGatewayStatusView(includeArchived = false) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    // 归档开关进 key：两个集合各自缓存，切回来不用重新等。
    queryKey: ["gateway-status-view", includeArchived],
    queryFn: () => fetchGatewayStatusView(includeArchived),
    // 有真实后端时 5s 轮询刷新；未配置 token 时也能以 example 数据渲染。
    refetchInterval: enabled ? 5_000 : 30_000,
  });
}

export function useGatewayStatus(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-status", gatewayId],
    queryFn: () => fetchGatewayStatus(gatewayId),
    refetchInterval: enabled ? 5_000 : 30_000,
    enabled: Boolean(gatewayId),
  });
}

/** 轮询网关历史序列；Query key 包含窗口，避免不同时间范围共享缓存。 */
export function useGatewayHistory(gatewayId: string, window = "1h") {
  useAuthVersion();
  const enabled = Boolean(gatewayId);
  return useQuery({
    queryKey: ["gateway-history", gatewayId, window],
    queryFn: () => fetchGatewayHistory(gatewayId, window),
    refetchInterval: getAdminApiToken() ? 15_000 : 30_000,
    enabled,
  });
}

/** 批量查询列表页网关历史，避免每张卡片各自创建一套 Query 生命周期。 */
export function useGatewayHistories(gatewayIds: string[], window = "1h") {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  const enabled = gatewayIds.length > 0;
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
    refetchInterval: hasAdminToken ? 15_000 : 30_000,
    enabled,
  });
}

/** 批量查询当前网关下 Agent 的历史，保持每个 Agent 独立缓存和错误回退。 */
export function useAgentHistories(gatewayId: string, agentIds: string[]) {
  useAuthVersion();
  const hasAdminToken = Boolean(getAdminApiToken());
  const enabled = Boolean(gatewayId) && agentIds.length > 0;
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
    refetchInterval: hasAdminToken ? 15_000 : 30_000,
    enabled,
  });
}

export function useGatewayLifecycle(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-lifecycle", gatewayId],
    queryFn: () => fetchGatewayLifecycle(gatewayId),
    refetchInterval: enabled ? 10_000 : 30_000,
    enabled: Boolean(gatewayId),
  });
}

/** 批量查询多网关下的 Agent 状态（版本发布页展示各 Agent 当前版本）。 */
export function useGatewayAgentsForAll(gatewayIds: string[]) {
  useAuthVersion();
  const enabled = gatewayIds.length > 0;
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
    refetchInterval: getAdminApiToken() ? 15_000 : 30_000,
    enabled,
  });
}

export function useGatewayAgents(gatewayId: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-agents", gatewayId],
    queryFn: () => fetchGatewayAgents(gatewayId),
    refetchInterval: enabled ? 5_000 : 30_000,
    enabled: Boolean(gatewayId),
  });
}

export function useGatewayList() {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["gateway-list"],
    queryFn: fetchGatewayList,
    refetchInterval: enabled ? 5_000 : 30_000,
  });
}

/** 一次拉取多个网关的在线率，返回 { gateway_id: uptime|null } 映射（列表页用）。 */
export function useReleases(component: string) {
  useAuthVersion();
  const enabled = Boolean(getAdminApiToken());
  return useQuery({
    queryKey: ["releases", component],
    queryFn: () => fetchReleases(component),
    refetchInterval: enabled ? 15_000 : 30_000,
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
      refetchInterval: enabled ? 15_000 : 30_000,
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
      refetchInterval: enabled ? 15_000 : 30_000,
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
    refetchInterval: enabled ? 10_000 : 30_000,
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
  // 无 Token 时仍请求一次，让 fetchOrFallback 提供与历史趋势一致的示例在线率。
  const enabled = gatewayIds.length > 0;
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
    refetchInterval: hasAdminToken ? 5_000 : 30_000,
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
  return useMutation({
    mutationFn: (command: BindGatewayCustomerCommand) =>
      bindGatewayCustomer(command),
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
    refetchInterval: enabled ? 15_000 : 30_000,
  });
}

/** 单份计划及其逐目标进度（计划详情）。 */
export function useUpgradePlan(planId: string | null) {
  useAuthVersion();
  return useQuery({
    queryKey: ["upgrade-plan", planId],
    queryFn: () => fetchUpgradePlan(planId as string),
    enabled: Boolean(planId),
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
