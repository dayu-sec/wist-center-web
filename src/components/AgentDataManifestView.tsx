import type {
  AgentCollectionEntry,
  AgentDataManifest,
  AgentInvestigationEntry,
} from "../api";
import {
  collectionDetailText,
  collectionProblems,
  investigationProblems,
  sortCollectionBySeverity,
} from "./agentManifestPresentation";
import { formatRelativeTime } from "./ui";
import styles from "./AgentDataManifestView.module.css";

/**
 * 一台 Agent 的**数据清单**（采集授权 + 调查数据）。
 *
 * 这里是**只读清单**：中心只回答「这台机器上有什么数据」，正文留在网关按需读取。
 * 三种状态必须能区分：`null` = 还没上报；空列表 = 确实没有；有内容 = 清单。
 *
 * 两个变体解决的是**两种看法**：
 * - `compact`（网关详情页的卡片）：只回答「有没有事」——两行摘要（条数 + 问题计数），
 *   **不列任何条目**。卡片是机队扫描用的，逐条的来源/说明会把卡片撑成一堵墙，
 *   而真正要看的入口在卡片底部的「详情 →」。
 * - `full`（Agent 详情页）：逐条列全（输入项带 `kind`、说明不折叠），不跟高。
 */
export function AgentDataManifestView({
  manifest,
  variant = "compact",
}: {
  manifest: AgentDataManifest | null;
  variant?: "compact" | "full";
}) {
  const compact = variant === "compact";
  const rootClass = compact ? styles.root : `${styles.root} ${styles.full}`;

  if (!manifest) {
    return (
      <div className={rootClass}>
        <div className={styles.empty}>这台 Agent 还没有上报数据清单。</div>
        {/* 空态要说清「为什么空」：只写「没有」会被当成「这台机器啥也没采」。 */}
        <div className={styles.hint}>
          清单由网关 ≥ 0.42.0 生成、gwlinkd ≥ 0.21.0 转报；升到这些版本前这里恒为空。
          也可以点「立即刷新」让网关现在上报一次，不必等 60s 周期。
        </div>
      </div>
    );
  }

  if (compact) return <ManifestSummary manifest={manifest} />;

  return (
    <div className={rootClass}>
      <CollectionSection entries={sortCollectionBySeverity(manifest.collection)} />
      <InvestigationSection entries={manifest.investigations} />
    </div>
  );
}

/**
 * 卡片上的两行摘要。
 *
 * 只给「多少条 / 有几件有问题的」：卡片上列出 `HostMetrics` 的来源与失败说明，
 * 等于把详情页塞进卡片 —— 同排两张卡就再也扫不动了。空清单单独说一句，
 * 与「还没上报」（`null`）区分开。
 */
function ManifestSummary({ manifest }: { manifest: AgentDataManifest }) {
  return (
    <div className={styles.root}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>采集授权</span>
        <span className={styles.summaryValue}>
          <CollectionProblemBadges entries={manifest.collection} />
          <span className={styles.count}>{manifest.collection.length} 条</span>
        </span>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>调查数据</span>
        <span className={styles.summaryValue}>
          <InvestigationProblemBadges entries={manifest.investigations} />
          <span className={styles.count}>{manifest.investigations.length} 份</span>
        </span>
      </div>
      {manifest.collection.length === 0 && manifest.investigations.length === 0 ? (
        <div className={styles.hint}>
          网关已上报清单，但这台机器目前没有采集授权，也没有调查数据。
        </div>
      ) : null}
    </div>
  );
}

function CollectionSection({ entries }: { entries: AgentCollectionEntry[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>采集授权</span>
        <span className={styles.sectionBadges}>
          <CollectionProblemBadges entries={entries} />
          <span className={styles.count}>{entries.length}</span>
        </span>
      </div>
      {entries.length === 0 ? (
        <div className={styles.empty}>没有生效的采集授权。</div>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.workId || entry.family} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.name} title={entry.family}>
                  {entry.family}
                </span>
                <span className={collectionTone(entry)}>
                  {collectionLabel(entry)}
                </span>
              </div>
              <div className={styles.meta}>
                <span>{entry.status === "paused" ? "已暂停" : "生效中"}</span>
                <span>
                  v{entry.acknowledgedVersion ?? "—"}/{entry.planVersion}
                </span>
              </div>
              {entry.inputs.length > 0 ? (
                <div className={styles.inputs}>
                  {entry.inputs.map((input) => (
                    <div
                      key={`${input.kind}:${input.target}`}
                      className={styles.input}
                    >
                      {/* 只给 target 会看不懂：`15s` 是间隔、`com.apple.alf` 是来源 id。 */}
                      <span className={styles.inputKind}>{input.kind}</span>
                      <code title={input.target}>{input.target}</code>
                    </div>
                  ))}
                </div>
              ) : null}
              {collectionDetailText(entry) ? (
                <div className={styles.detail} title={collectionDetailText(entry) ?? undefined}>
                  {collectionDetailText(entry)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InvestigationSection({ entries }: { entries: AgentInvestigationEntry[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>调查数据</span>
        <span className={styles.sectionBadges}>
          <InvestigationProblemBadges entries={entries} />
          <span className={styles.count}>{entries.length} 份</span>
        </span>
      </div>
      {entries.length === 0 ? (
        <div className={styles.empty}>
          网关本机还没看到报告（任务进度看上方「调查」）。
        </div>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li
              key={`${entry.commandId}:${entry.topic}:${entry.observedAt}`}
              className={styles.item}
            >
              <div className={styles.itemHead}>
                <span className={styles.name} title={entry.topic}>
                  {entry.topic}
                </span>
                <span className={verdictTone(entry.overall)}>
                  {verdictLabel(entry.overall)}
                </span>
              </div>
              <div className={styles.meta}>
                <span>正常 {entry.findingsOk}</span>
                <span>警告 {entry.findingsWarn}</span>
                <span>失败 {entry.findingsFail}</span>
                {/* 未知不能省：少了它，“没读到”会被看成“正常”。 */}
                <span>未知 {entry.findingsUnknown}</span>
              </div>
              <div className={styles.meta}>
                {/* 说清这是**观测时刻**，别和卡片底部的「最后上报」混成一个时间。 */}
                <span>
                  {entry.observedAt
                    ? `观测于 ${formatRelativeTime(entry.observedAt)}`
                    : "观测时刻未知"}
                </span>
                {entry.judged ? null : <span>仅证据，不做判定</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 段头 / 摘要行的问题计数（`2 降级` / `1 失败`）；没问题时不占位。 */
function CollectionProblemBadges({
  entries,
}: {
  entries: AgentCollectionEntry[];
}) {
  const { failed, degraded, unreported } = collectionProblems(entries);
  return (
    <>
      {failed > 0 ? (
        <span className={`${styles.problem} ${styles.toneFail}`}>
          {failed} 失败
        </span>
      ) : null}
      {degraded > 0 ? (
        <span className={`${styles.problem} ${styles.toneWarn}`}>
          {degraded} 降级
        </span>
      ) : null}
      {unreported > 0 ? (
        <span className={`${styles.problem} ${styles.toneUnknown}`}>
          {unreported} 未上报
        </span>
      ) : null}
    </>
  );
}

function InvestigationProblemBadges({
  entries,
}: {
  entries: AgentInvestigationEntry[];
}) {
  const { failed, warned } = investigationProblems(entries);
  return (
    <>
      {failed > 0 ? (
        <span className={`${styles.problem} ${styles.toneFail}`}>
          {failed} 失败
        </span>
      ) : null}
      {warned > 0 ? (
        <span className={`${styles.problem} ${styles.toneWarn}`}>
          {warned} 警告
        </span>
      ) : null}
    </>
  );
}

function collectionLabel(entry: AgentCollectionEntry): string {
  switch (entry.collectionResult) {
    case "success":
      return "采集中";
    case "partial":
      return "部分失败";
    case "failure":
      return "失败";
    case "cancelled":
      return entry.collectionPrerequisites === "blocked" ? "待就绪" : "已暂停";
    case "pending":
      return entry.collectionPrerequisites === "blocked"
        ? "待就绪（等目标）"
        : "未知";
    default:
      break;
  }
  // 旧 agentd：回退到单一状态。
  switch (entry.collectionStatus) {
    case "ok":
      return "采集中";
    case "degraded":
      return "降级";
    case "failed":
      return "失败";
    case "unknown":
      return "未知";
    case "paused":
      return "已暂停";
    default:
      return "未上报";
  }
}

function collectionTone(entry: AgentCollectionEntry): string {
  switch (entry.collectionResult) {
    case "success":
      return styles.toneOk;
    case "partial":
      return styles.toneWarn;
    case "failure":
      return styles.toneFail;
    case "cancelled":
    case "pending":
      return styles.toneUnknown;
    default:
      break;
  }
  switch (entry.collectionStatus) {
    case "ok":
      return styles.toneOk;
    case "degraded":
      return styles.toneWarn;
    case "failed":
      return styles.toneFail;
    default:
      return styles.toneUnknown;
  }
}

function verdictLabel(value: string): string {
  switch (value.toLowerCase()) {
    case "ok":
      return "正常";
    case "warn":
      return "警告";
    case "fail":
      return "失败";
    default:
      return "未知";
  }
}

function verdictTone(value: string): string {
  switch (value.toLowerCase()) {
    case "ok":
      return styles.toneOk;
    case "warn":
      return styles.toneWarn;
    case "fail":
      return styles.toneFail;
    default:
      return styles.toneUnknown;
  }
}
