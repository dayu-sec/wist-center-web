import type { AgentCollectionEntry, AgentDataManifest } from "../api";
import { formatRelativeTime } from "./ui";
import styles from "./AgentDataManifestView.module.css";

/**
 * 一台 Agent 的**数据清单**（采集授权 + 调查数据）。
 *
 * 这里是**只读清单**：中心只回答「这台机器上有什么数据」，正文留在网关按需读取。
 * 三种状态必须能区分：`null` = 还没上报；空列表 = 确实没有；有内容 = 清单。
 */
export function AgentDataManifestView({
  manifest,
}: {
  manifest: AgentDataManifest | null;
}) {
  if (!manifest) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>该网关还没有上报数据清单。</div>
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>采集授权</span>
          <span className={styles.count}>{manifest.collection.length}</span>
        </div>
        {manifest.collection.length === 0 ? (
          <div className={styles.empty}>没有生效的采集授权。</div>
        ) : (
          <ul className={styles.list}>
            {manifest.collection.map((entry) => (
              <li key={entry.workId || entry.family} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.name}>{entry.family}</span>
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
                      <code key={`${input.kind}:${input.target}`}>
                        {input.target}
                      </code>
                    ))}
                  </div>
                ) : null}
                {entry.collectionDetail ? (
                  <div className={styles.detail}>{entry.collectionDetail}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>调查数据</span>
          <span className={styles.count}>{manifest.investigations.length}</span>
        </div>
        {manifest.investigations.length === 0 ? (
          <div className={styles.empty}>还没有调查数据。</div>
        ) : (
          <ul className={styles.list}>
            {manifest.investigations.map((entry) => (
              <li
                key={`${entry.commandId}:${entry.topic}:${entry.observedAt}`}
                className={styles.item}
              >
                <div className={styles.itemHead}>
                  <span className={styles.name}>{entry.topic}</span>
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
                  <span>
                    {entry.observedAt
                      ? formatRelativeTime(entry.observedAt)
                      : "观测时刻未知"}
                  </span>
                  {entry.judged ? null : <span>仅证据，不做判定</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function collectionLabel(entry: AgentCollectionEntry): string {
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
