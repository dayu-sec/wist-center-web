import { useState } from "react";
import styles from "./GatewayInstanceDetailPage.module.css";

/** 代码块：展示 + 复制（可选下载）。 */
export function CodeBlock({
  label,
  code,
  filename,
  hint,
}: {
  label: string;
  code: string;
  filename?: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时保留可选中的原始文本。
    }
  }

  function handleDownload() {
    if (!filename) return;
    const blobUrl = URL.createObjectURL(
      new Blob([code], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className={styles.curlBlock}>
      <div className={styles.curlHeader}>
        <div>
          <span className={styles.infoLabel}>{label}</span>
          {hint ? <p className={styles.curlHint}>{hint}</p> : null}
        </div>
        <div>
          {filename ? (
            <button
              type="button"
              className={styles.curlCopyButton}
              onClick={handleDownload}
            >
              下载
            </button>
          ) : null}
          <button
            type="button"
            className={styles.curlCopyButton}
            onClick={handleCopy}
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      <pre className={styles.curlCode}>{code}</pre>
    </div>
  );
}
