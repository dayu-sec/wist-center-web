import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api 代理目标用 WARP_INSIGHT_WEB_PROXY_TARGET 覆盖（默认 127.0.0.1:3100）。
// demo-gateway.sh 用独立端口 + 指向自己的 center，避免与 demo-insight-center 共用环境。
// secure:false —— 中心以自签 HTTPS 起（dev **默认打开 TLS**）时，代理要接受自签证书。

/**
 * 仅 dev：从中心配置读 admin token。
 *
 * 路径可用 `WIST_CENTER_CONFIG` 覆盖，默认 `~/.wist-center/wist-center.toml`（dev 中心那份）。
 * 读不到就返回空串（代理不补 Authorization，回落到页面手填）。
 */
function devAdminToken(): string {
  const path =
    process.env.WIST_CENTER_CONFIG ??
    join(homedir(), ".wist-center", "wist-center.toml");
  try {
    const match = readFileSync(path, "utf8").match(
      /^\s*admin_token\s*=\s*"([^"]*)"/m,
    );
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export default defineConfig(({ command }) => {
  const devToken = command === "serve" ? devAdminToken() : "";
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target:
            process.env.WARP_INSIGHT_WEB_PROXY_TARGET ?? "http://127.0.0.1:3100",
          changeOrigin: true,
          secure: false,
          // 中心管理接口要 Bearer。浏览器没手填 token 时接口 401，而前端对失败**静默回落到
          // 「示例数据」**——页面看着能用、其实全是假的（假实例 + 假接入链接）。dev 代理直接从
          // 中心配置读 token，并在**请求没带 Authorization 时**补上：页面一打开就是真数据，
          // 且 token 不进前端包。已手填的 token 优先（不覆盖）。
          configure: (proxy) => {
            if (!devToken) return;
            proxy.on("proxyReq", (proxyReq) => {
              if (!proxyReq.getHeader("authorization")) {
                proxyReq.setHeader("authorization", `Bearer ${devToken}`);
              }
            });
          },
        },
      },
    },
  };
});
