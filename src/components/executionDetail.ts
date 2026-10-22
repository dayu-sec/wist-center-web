/**
 * 拆分逐目标执行反馈：`detail` 里常把「退出状态 / 未佐证原因」和「日志目录」挤在一行，
 * 直接塞进表格会被超长路径撑开。这里把日志路径摘出来，消息与路径各占一行。
 *
 * 同时容忍 `日志:` / `日志：` / `日志目录:` / `日志路径:` 几种写法；没有日志段时回落到
 * 条目自带的 `logDir`。纯函数，便于契约测试。
 */
export interface ExecutionDetailParts {
  /** 去掉日志路径后的反馈正文（可能为空）。 */
  message: string;
  /** 日志目录 / 路径；没有则为 null。 */
  logPath: string | null;
}

export function splitExecutionDetail(
  detail: string | null | undefined,
  logDir: string | null | undefined,
): ExecutionDetailParts {
  const text = (detail ?? "").trim();
  if (!text) {
    return { message: "", logPath: (logDir ?? "").trim() || null };
  }
  // 例：`executor exit status: 0; 未佐证（读不到长期身份）；日志: /path/to/tasks/...`
  const match = text.match(/^(.*?)[；;]?\s*日志(?:目录|路径)?\s*[:：]\s*(.+)$/s);
  if (match && match[2].trim()) {
    return { message: match[1].trim(), logPath: match[2].trim() };
  }
  return { message: text, logPath: (logDir ?? "").trim() || null };
}
