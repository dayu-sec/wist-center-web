import { useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { matchPath, useLocation } from "react-router-dom";
import { ADMIN_AUTH_CHANGED_EVENT, getAdminApiToken } from "../api";
import { useExampleFallbackCount } from "../hooks";
import styles from "./AppStatusBar.module.css";

const SECTION_LABELS: Record<string, string> = {
  monitoring: "监控",
  ops: "运维",
};

interface RouteMeta {
  section: keyof typeof SECTION_LABELS;
  crumbs: string[];
}

/** 路由 → 面包屑。detail 段由页面自身补充，这里只负责到二级。 */
function describeRoute(pathname: string): RouteMeta {
  if (matchPath("/gateways/:gatewayId", pathname)) {
    return { section: "monitoring", crumbs: ["网关态势", "网关详情"] };
  }
  if (matchPath("/instance/:gatewayId", pathname)) {
    return { section: "ops", crumbs: ["网关管理", "实例详情"] };
  }
  switch (pathname) {
    case "/":
      return { section: "monitoring", crumbs: ["网关态势"] };
    case "/instance":
      return { section: "ops", crumbs: ["网关管理"] };
    case "/release":
      return { section: "ops", crumbs: ["发布计划"] };
    case "/release/execute":
    case "/upgrade-plan/approve": // 旧地址，重定向到 /release/execute
      return { section: "ops", crumbs: ["发布执行"] };
    case "/upgrade-plan": // 旧地址，重定向到 /release
      return { section: "ops", crumbs: ["发布计划"] };
    case "/packages":
      return { section: "ops", crumbs: ["安装包管理"] };
    case "/packages/add":
      return { section: "ops", crumbs: ["安装包录入"] };
    default:
      return { section: "monitoring", crumbs: ["未知页面"] };
  }
}

/**
 * 全局状态条：跨页面常驻，回答三个运维最常问的问题
 * —— 我在哪儿、数据是不是在自动刷新、上一次成功同步是什么时候。
 */
export function AppStatusBar() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [hasToken, setHasToken] = useState(() => Boolean(getAdminApiToken()));
  // 缓存里有多少查询回落到了示例数据（真实来源，而不是「有没有手填 token」）。
  const exampleFallbacks = useExampleFallbackCount();

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === "updated" && event.query.state.dataUpdatedAt) {
        setLastSyncedAt(event.query.state.dataUpdatedAt);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const onAuthChanged = () => setHasToken(Boolean(getAdminApiToken()));
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    return () =>
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  const route = describeRoute(pathname);
  const syncing = fetching > 0;
  const appVersion = import.meta.env.VITE_APP_VERSION;

  return (
    <div className={styles.bar}>
      <nav className={styles.crumbs} aria-label="面包屑">
        <span className={styles.crumbRoot}>{SECTION_LABELS[route.section]}</span>
        {route.crumbs.map((crumb, index) => (
          <span key={crumb} className={styles.crumbGroup}>
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
            <span
              className={
                index === route.crumbs.length - 1
                  ? styles.crumbCurrent
                  : styles.crumb
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className={styles.right}>
        {/*
          说「示例数据」的依据是**接口自己的回落标记**（`source === "example"`），不是
          「浏览器里有没有手填 Token」—— dev 代理在服务端补 token 时页面没有 token 也是真数据，
          按 token 判会把真机队说成示例、也会把示例说成真的（后者更危险：会照着一份假机队建计划）。
        */}
        <span
          className={
            exampleFallbacks > 0
              ? `${styles.pill} ${styles.pillIdle}`
              : `${styles.pill} ${styles.pillLive}`
          }
          title={
            exampleFallbacks > 0
              ? `${exampleFallbacks} 个查询回落到内置示例数据：后端管理接口不可达或未鉴权（左侧可填 Admin Token）`
              : "数据来自中心：每 5 秒自动拉取一次网关与指标"
          }
        >
          <span
            className={syncing ? styles.dotSyncing : styles.dot}
            aria-hidden="true"
          />
          {syncing
            ? "同步中"
            : exampleFallbacks > 0
              ? `示例数据 ×${exampleFallbacks}`
              : "自动刷新 5s"}
        </span>

        <span className={styles.stamp}>
          最近同步
          <strong className={styles.stampValue}>
            {lastSyncedAt
              ? new Intl.DateTimeFormat("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }).format(new Date(lastSyncedAt))
              : "—"}
          </strong>
        </span>

        {appVersion && (
          <span className={styles.version} title="前端版本">
            v{appVersion}
          </span>
        )}

        <button
          type="button"
          className={styles.refresh}
          onClick={() => void queryClient.invalidateQueries()}
          disabled={!hasToken}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5V5H10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          刷新
        </button>
      </div>
    </div>
  );
}
