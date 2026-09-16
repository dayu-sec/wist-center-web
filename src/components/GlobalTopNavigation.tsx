import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import {
  ADMIN_AUTH_CHANGED_EVENT,
  clearAdminApiToken,
  getAdminApiToken,
  setAdminApiToken,
} from "../api";
import styles from "./GlobalTopNavigation.module.css";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

function IconOverview() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.6" y="1.6" width="5.2" height="5.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.2" y="1.6" width="5.2" height="5.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.6" y="9.2" width="5.2" height="5.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.2" y="9.2" width="5.2" height="5.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconInstance() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.8" y="2.4" width="12.4" height="4.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.8" y="9" width="12.4" height="4.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.6" cy="4.7" r="0.9" fill="currentColor" />
      <circle cx="4.6" cy="11.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconRelease() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M8 1.8 14 5v6L8 14.2 2 11V5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2 5l6 3.2L14 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 8.2v6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconPlan() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="3.4" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.1 8h2.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.2" cy="4.4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.2" cy="11.6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.2 8 9.2 5.6M7.2 8l2 2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.7 4.4h2.2M10.7 11.6h2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconApprove() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.4 8.2 7.2 10l3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "监控",
    items: [
      { to: "/", label: "网关态势", icon: <IconOverview />, end: true },
    ],
  },
  {
    label: "运维",
    items: [
      { to: "/instance", label: "网关管理", icon: <IconInstance />, end: true },
    ],
  },
  {
    label: "发布",
    items: [
      { to: "/release", label: "版本发布", icon: <IconRelease /> },
      { to: "/upgrade-plan", label: "升级计划", icon: <IconPlan />, end: true },
      {
        to: "/upgrade-plan/approve",
        label: "批准升级计划",
        icon: <IconApprove />,
      },
    ],
  },
];

interface GlobalTopNavigationProps {
  children?: React.ReactNode;
}

/** 左侧全局导航：业务导航分组 + 贴底的 Admin Token 表单。 */
export function GlobalTopNavigation({
  children,
}: GlobalTopNavigationProps) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => getAdminApiToken() ?? "");
  const [applied, setApplied] = useState(false);
  const appliedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(appliedTimer.current), []);

  useEffect(() => {
    function refreshToken() {
      setToken(getAdminApiToken() ?? "");
    }
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, refreshToken);
    return () => {
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, refreshToken);
    };
  }, []);

  const hasToken = Boolean(getAdminApiToken());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminApiToken(token);
    setToken(getAdminApiToken() ?? "");
    setApplied(true);
    window.clearTimeout(appliedTimer.current);
    appliedTimer.current = window.setTimeout(() => setApplied(false), 1600);
    void queryClient.invalidateQueries();
  }

  function handleClear() {
    clearAdminApiToken();
    setToken("");
    void queryClient.invalidateQueries();
  }

  return (
    <aside className={styles.container}>
      {children ?? (
        <>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <svg viewBox="0 0 20 20" width="17" height="17">
                <path
                  d="M10 2.4 17 6.2v7.6L10 17.6 3 13.8V6.2Z"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="10" r="1.9" fill="#fff" />
              </svg>
            </span>
            <span className={styles.brandCopy}>
              <span className={styles.brandText}>WarpInsightCenter</span>
              <span className={styles.brandSub}>全局控制中心</span>
            </span>
          </div>

          <nav className={styles.links} aria-label="主导航">
            {NAV_GROUPS.map((group) => (
              <div className={styles.navGroup} key={group.label}>
                <span className={styles.navLabel}>{group.label}</span>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      isActive ? `${styles.link} ${styles.active}` : styles.link
                    }
                  >
                    <span className={styles.linkIcon}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <form className={styles.authForm} onSubmit={handleSubmit}>
            <div className={styles.authHead}>
              <label
                className={styles.authLabel}
                htmlFor="warp-insight-center-token"
              >
                Admin Token
              </label>
              <span
                className={
                  hasToken
                    ? `${styles.authState} ${styles.authStateOn}`
                    : styles.authState
                }
              >
                {hasToken ? "已设置" : "未设置"}
              </span>
            </div>
            <input
              id="warp-insight-center-token"
              className={styles.authInput}
              type="password"
              autoComplete="off"
              placeholder="粘贴管理令牌"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <p className={styles.authHint}>
              仅存于本会话标签页，用于调用 Center 管理接口。
            </p>
            <div className={styles.authActions}>
              <button
                className={`${styles.authButton} ${styles.authPrimary}`}
                type="submit"
                disabled={!token || token === getAdminApiToken()}
              >
                {applied ? "已应用" : "应用"}
              </button>
              <button
                className={styles.authButton}
                type="button"
                onClick={handleClear}
                disabled={!hasToken}
              >
                清除
              </button>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
