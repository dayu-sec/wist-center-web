import { useRef, useState } from "react";

/** 「复制」反馈的三态：空闲 / 已复制 / 失败。 */
export type CopyState = "idle" | "ok" | "failed";

/**
 * 复制文本到剪贴板：优先 Clipboard API（HTTPS / localhost），失败时回落到
 * 临时 textarea + `execCommand`（非安全上下文 / 老浏览器）。返回是否成功。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒 / 页面未聚焦：落到下面的兜底。
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 点击复制的反馈状态：成功后 1.5s 内显示「已复制」，失败显示「复制失败」。
 * 复制动作本身由调用方触发（`copy(text)`），这里只管状态与定时复位。
 */
export function useCopyFeedback(): {
  state: CopyState;
  copy: (text: string) => Promise<void>;
} {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  async function copy(text: string) {
    const ok = await copyToClipboard(text);
    setState(ok ? "ok" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1500);
  }

  return { state, copy };
}
