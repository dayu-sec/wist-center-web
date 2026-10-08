import type {
  ReactNode,
  InputHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";
import type { RolloutTone } from "@dayu-sec/wist-web-core/release";
import styles from "./ui.module.css";

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** 字节数 → 可读大小（MB/GB）。 */
export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const mb = value / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

/** CPU/时延百分比格式化。 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

/** 秒数 → 可读时长（天/时/分/秒）；可空。 */
export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value <= 0) return "0 秒";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分`;
  return `${value} 秒`;
}

/** 实例生命周期状态的中文标签。 */
export function lifecycleLabel(state: string): string {
  switch (state) {
    case "Provisioned":
      return "已创建（待部署）";
    case "Initializing":
      return "初始化中";
    case "Running":
      return "已运行";
    case "Failed":
      return "失败";
    default:
      return state;
  }
}

/** 实例生命周期状态对应的徽标色调。 */
export function lifecycleTone(state: string): BadgeTone {
  switch (state) {
    case "Running":
      return "green";
    case "Initializing":
      return "blue";
    case "Failed":
      return "red";
    default:
      return "gray";
  }
}

/** 相对时间："x 秒前 / x 分钟前 / x 小时前 / x 天前"。 */
export function formatRelativeTime(value: string | Date): string {
  const then =
    typeof value === "string" ? new Date(value).getTime() : value.getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "刚刚";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

/** 提供控制中心页面共享的导航、标题层级和主内容布局。 */
export function PageShell({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.pageShell}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{title}</h1>
        <p className={styles.pageSummary}>{summary}</p>
      </header>
      <main className={styles.pageMain}>{children}</main>
    </div>
  );
}

export type BadgeTone = "green" | "amber" | "red" | "gray" | "blue";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  green: styles.badgeGreen,
  amber: styles.badgeAmber,
  red: styles.badgeRed,
  gray: styles.badgeGray,
  blue: styles.badgeBlue,
};

type MetricTone = "accent" | "green" | "amber" | "red";

const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  accent: styles.metricToneAccent,
  green: styles.metricToneGreen,
  amber: styles.metricToneAmber,
  red: styles.metricToneRed,
};

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.badge} ${BADGE_TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** KPI 磁贴：左侧色条表达状态，数值等宽，hint 补充口径说明。 */
export function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: MetricTone;
}) {
  const toneClass = tone ? METRIC_TONE_CLASS[tone] : undefined;
  return (
    <div className={`${styles.metric} ${toneClass ?? ""}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={styles.input} {...props} />;
}

export function FormStack({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.formStack}>
      {children}
      {actions ? <div className={styles.formActions}>{actions}</div> : null}
    </div>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={styles.primaryButton} {...props}>
      {props.children}
    </button>
  );
}

export function ReceiptCard({
  title,
  fields,
}: {
  title: string;
  fields: [label: string, value: ReactNode][];
}) {
  return (
    <div className={styles.receipt}>
      <div className={styles.receiptTitle}>{title}</div>
      <dl className={styles.receiptGrid}>
        {fields.map(([label, value]) => (
          <div key={label} className={styles.receiptItem}>
            <dt className={styles.receiptLabel}>{label}</dt>
            <dd className={styles.receiptValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return <div className={styles.errorBanner}>{children}</div>;
}

/** 托管记录状态文案（published → 已录入 / expired → 已过期）。 */
export function releaseStatusLabel(status: string): string {
  switch (status) {
    case "published":
      return "已录入";
    case "expired":
      return "已过期";
    default:
      return status;
  }
}

/** 托管记录状态徽标色调。 */
export function releaseStatusTone(status: string): BadgeTone {
  switch (status) {
    case "published":
      return "green";
    case "expired":
      return "gray";
    default:
      return "gray";
  }
}

/** 灰度发布计划的**共享口径语气**（`RolloutTone`）→ 本 app 的徽标色。 */
export function rolloutToneToBadge(tone: RolloutTone): BadgeTone {
  switch (tone) {
    case "ok":
      return "green";
    case "warn":
      return "amber";
    case "crit":
      return "red";
    default:
      return "gray";
  }
}

/** 平台展示：解析不出目标平台（部署栈类包）时显示「通用」。 */
export function platformLabel(platform: string | null | undefined): string {
  return platform && platform.length > 0 ? platform : "通用";
}

export function LoadingDots() {
  return <span className={styles.loading}>加载中…</span>;
}

export function ExampleTag() {
  return <span className={styles.exampleTag}>示例数据</span>;
}
