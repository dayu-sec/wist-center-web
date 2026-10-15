import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ApiError } from "./api";
import { initTheme } from "./theme";
import "./index.css";

// 首次渲染**之前**定下主题：晚一步会先按深色画一帧再跳浅色（闪一下）。
// 切主题不重挂载组件树 —— 颜色走 CSS 变量，改 `<html data-theme>` 全站即变。
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx（401/403/404/429…）重试无意义，还会把「错 token」放大成限流封禁（5 次/60s →
      // 封 60s）：一律不重试。只有网络错误 / 5xx 这类瞬时故障才重试 2 次。
      retry: (failureCount, error) => {
        const status = error instanceof ApiError ? error.status : undefined;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
