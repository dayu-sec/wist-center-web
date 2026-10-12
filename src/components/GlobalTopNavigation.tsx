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
import { VersionFooter } from "./VersionFooter";

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

function IconPackage() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="2" y="7.4" width="12" height="6.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.2 7.4V5.2h7.6v2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.2 5.2V3.4h3.6v1.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function IconPackageAdd() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.6" y="7.4" width="9.8" height="6.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.8 7.4V5.2h5.4v2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12.4 2.4v6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.4 5.4h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
    label: "发布与升级",
    items: [
      { to: "/packages", label: "安装包管理", icon: <IconPackage />, end: true },
      {
        to: "/packages/add",
        label: "安装包录入",
        icon: <IconPackageAdd />,
        end: true,
      },
      { to: "/release", label: "发布计划", icon: <IconRelease />, end: true },
      {
        to: "/release/execute",
        label: "发布执行",
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
  // 输入框**不预填已存 token**：预填旧值（还是密码框）+ 直接粘贴会拼成「旧+新」，导致「输了新
  // token 却一直 401」。空框起步、粘贴即整体替换。
  const [token, setToken] = useState("");
  // 「已设置」以**实际存储**为准（经变更事件刷新），不拿输入框内容当判据。
  const [hasStoredToken, setHasStoredToken] = useState(() =>
    Boolean(getAdminApiToken()),
  );
  const [applied, setApplied] = useState(false);
  const appliedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(appliedTimer.current), []);

  useEffect(() => {
    function onAuthChanged() {
      const hasToken = Boolean(getAdminApiToken());
      setHasStoredToken(hasToken);
      // token 变了：设了 → 重新取；清了 → **丢弃**缓存（含上一条 401/429），否则清完页面上
      // 还挂着旧横幅，看起来像「点了清除没生效」。
      if (hasToken) {
        void queryClient.invalidateQueries();
      } else {
        queryClient.removeQueries();
      }
    }
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [queryClient]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminApiToken(token);
    setToken(""); // 不把密钥留在输入框
    setApplied(true);
    window.clearTimeout(appliedTimer.current);
    appliedTimer.current = window.setTimeout(() => setApplied(false), 1600);
  }

  function handleClear() {
    clearAdminApiToken();
    setToken("");
  }

  return (
    <aside className={styles.container}>
      {children ?? (
        <>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              {/* 三格蜂巢（与 /favicon.svg 同一套几何）—— 一眼区别于网关的单格立方体。 */}
              <svg viewBox="0 0 20 20" width="17" height="17">
                <g
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                >
                  <path d="M10 2.39 13.77 4.565v4.35L10 11.09 6.23 8.915v-4.35Z" />
                  <path d="M6.23 8.915 10 11.09v4.35L6.23 17.615 2.46 15.44v-4.35Z" />
                  <path d="M13.77 8.915 17.54 11.09v4.35L13.77 17.615 10 15.44v-4.35Z" />
                </g>
              </svg>
            </span>
            <span className={styles.brandCopy}>
              <span className={styles.brandText}>WistCenter</span>
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
                  hasStoredToken
                    ? `${styles.authState} ${styles.authStateOn}`
                    : styles.authState
                }
              >
                {hasStoredToken ? "已设置" : "未设置"}
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
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className={styles.authHint}>
              仅存于本会话标签页，用于调用 Center 管理接口。
            </p>
            <div className={styles.authActions}>
              <button
                className={`${styles.authButton} ${styles.authPrimary}`}
                type="submit"
                disabled={!token}
              >
                {applied ? "已应用" : "应用"}
              </button>
              <button
                className={styles.authButton}
                type="button"
                onClick={handleClear}
                disabled={!hasStoredToken}
              >
                清除
              </button>
            </div>
          </form>

          {/* 左下角常驻版本块：前端 + 后端版本（吸底，见 VersionFooter.module.css）。 */}
          <VersionFooter />
        </>
      )}
    </aside>
  );
}
