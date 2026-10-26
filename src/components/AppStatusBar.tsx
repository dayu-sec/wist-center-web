import { useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { matchPath, useLocation } from "react-router-dom";
import {
  useAdminToken,
  useAuthErrorSignal,
  useExampleFallbackCount,
} from "../hooks";
import { toggleAppTheme, useAppTheme } from "../theme";
import { AdminTokenControl } from "./AdminTokenControl";
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
 * 「多久以前同步的」：粗粒度、像一句话（`刚刚` / `12 秒前` / `2 分钟前` / `1 小时前`）。
 *
 * 用相对时间而不是绝对时钟：状态胶囊要回答的是「数据新不新」，不是「现在几点」。
 * 与 `wist-gateway-web` 同一套口径（这边没有 i18n，所以只有中文）。
 */
function freshnessLabel(ageMs: number | null): string | null {
  if (ageMs === null) return null;
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  return `${hours} 小时前`;
}

/**
 * 全局状态条：跨页面常驻，回答三个运维最常问的问题
 * —— 我在哪儿、数据是不是在自动刷新、上一次成功同步是什么时候。
 *
 * 右半边与 `wist-gateway-web` 对齐：同步状态与新鲜度同处一个胶囊（相对时间，绝对时刻进 tooltip）、
 * 刷新收成图标按钮、主题开关、管理令牌的钥匙按钮与面板。中心这边没有 i18n，所以没有语言开关。
 */
export function AppStatusBar() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const token = useAdminToken();
  const authError = useAuthErrorSignal();
  // 缓存里有多少查询回落到了示例数据（真实来源，而不是「有没有手填 token」）。
  const exampleFallbacks = useExampleFallbackCount();
  const theme = useAppTheme();

  // 相对时间的重算刻度：5 秒（与轮询同频），粗粒度标签不需要每秒重算。
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === "updated" && event.query.state.dataUpdatedAt) {
        setLastSyncedAt(event.query.state.dataUpdatedAt);
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const route = describeRoute(pathname);
  const syncing = fetching > 0;

  // 鉴权问题优先展示：没 token / token 被拒是「为什么没数据」的头号原因。
  const authIssue = !token || authError;
  const exampleData = !authIssue && exampleFallbacks > 0;
  const statusText = !token
    ? "未设置 Admin Token"
    : authError
      ? "Admin Token 无效"
      : syncing
        ? "同步中"
        : exampleFallbacks > 0
          ? `示例数据 ×${exampleFallbacks}`
          : "自动刷新 5s";

  const lastSyncedText = lastSyncedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(lastSyncedAt))
    : null;
  const syncedAgoMs = lastSyncedAt === null ? null : nowTick - lastSyncedAt;
  // 自动刷新是 5 秒一次：明显超过这个间隔还没更新，说明轮询卡住了 —— 这时候不能绿着宣称
  // 「自动刷新 5s」，转琥珀色并照实说「N 分钟前」。
  const syncStale =
    Boolean(token) && !syncing && syncedAgoMs !== null && syncedAgoMs > 30_000;

  const statusTitle = !token
    ? "尚未填入 Admin Token：填入后才向中心拉取数据（右上角钥匙按钮可填）"
    : authError
      ? "中心拒绝了当前 Admin Token（401）：请重新填入正确令牌"
      : exampleFallbacks > 0
        ? `${exampleFallbacks} 个查询回落到内置示例数据：后端管理接口不可达`
        : `数据来自中心：每 5 秒自动拉取一次网关与指标；最近同步 ${lastSyncedText ?? "—"}`;

  return (
    <div className={styles.bar}>
      <nav className={styles.crumbs} aria-label="面包屑">
        <span className={styles.crumbRoot}>
          {SECTION_LABELS[route.section]}
        </span>
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
        {/* 浅色 / 深色：图标画的是「点下去会切到的那种」（当前深色显示太阳、浅色显示月亮）。 */}
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => toggleAppTheme()}
          title={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
          aria-label={
            theme === "light"
              ? "当前浅色主题，点击切换到深色"
              : "当前深色主题，点击切换到浅色"
          }
        >
          {theme === "light" ? (
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle
                cx="8"
                cy="8"
                r="3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6" />
                <path d="M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
              </g>
            </svg>
          )}
        </button>

        {/*
          「示例数据」的依据是**接口自己的回落标记**（`source === "example"`），不是「有没有手填
          Token」。未鉴权 / 无 token 已由内容区 gate 拦在前面，不会走到这里显示假数据。
          新鲜度与状态同处一个胶囊：这俩说的本来就是一件事（数据新不新）。
        */}
        <span
          className={
            authIssue
              ? `${styles.pill} ${styles.pillIdle}`
              : exampleData
                ? `${styles.pill} ${styles.pillExample}`
                : syncStale
                  ? `${styles.pill} ${styles.pillStale}`
                  : `${styles.pill} ${styles.pillLive}`
          }
          title={statusTitle}
        >
          <span
            className={syncing && !authIssue ? styles.dotSyncing : styles.dot}
            aria-hidden="true"
          />
          {statusText}
          {!authIssue && freshnessLabel(syncedAgoMs) ? (
            <>
              <span className={styles.pillDivider} aria-hidden="true" />
              <span className={styles.pillFreshness}>
                {freshnessLabel(syncedAgoMs)}
              </span>
            </>
          ) : null}
        </span>

        <button
          type="button"
          className={`${styles.refresh} ${styles.refreshIconOnly}`}
          onClick={() => void queryClient.invalidateQueries()}
          disabled={!token}
          title="刷新"
          aria-label="刷新"
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
        </button>

        {/* 管理令牌：会话语境的凭证，归状态条管（面板贴在它下面）。 */}
        <AdminTokenControl />
      </div>
    </div>
  );
}
