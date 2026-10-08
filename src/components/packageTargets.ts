import type { PackageTarget, PlatformSlot } from "./PackagePanel";

/**
 * galaxy-ops / galaxy-flow 的平台槽位：一次录入必须三平台齐备。
 * `id` 为**完整 target-triple**（gnu / musl 算不同平台），与后端按包文件名解析出的一致。
 */
const THREE_PLATFORMS: PlatformSlot[] = [
  {
    id: "aarch64-apple-darwin",
    label: "macOS · ARM",
    hint: "aarch64-apple-darwin",
  },
  {
    id: "x86_64-unknown-linux-musl",
    label: "Linux · x86_64 · musl",
    hint: "x86_64-unknown-linux-musl",
  },
  {
    id: "aarch64-unknown-linux-musl",
    label: "Linux · ARM64 · musl",
    hint: "aarch64-unknown-linux-musl",
  },
];

/**
 * 中心**托管**的安装包目录（`component` 即后端 `:component` 路径段）：
 * agentd 包 / gateway-stack 包 / galaxy-ops 包 / galaxy-flow 包。
 *
 * 列表页与录入页共用这一份目标定义，避免两处漂移。
 */
export const RELEASE_TARGETS: PackageTarget[] = [
  {
    component: "wist-gateway-stack",
    name: "WarpGateWay",
    tagline: "网关运行时",
    subtitle: "网关运行时安装包（gateway-stack 部署包），供 Gateway 实例升级。",
    artifactPlaceholder:
      "https://artifacts.example.com/wist-gateway-stack/v3.1.0.tar.gz",
  },
  {
    component: "wist-agentd",
    name: "WistAgentd",
    tagline: "Agent 服务",
    subtitle: "Agent 服务安装包，供各 WarpGateWay 实例拉取。",
    artifactPlaceholder: "https://artifacts.example.com/wist-agentd/v2.4.1",
  },
  {
    component: "galaxy-ops",
    name: "galaxy-ops",
    tagline: "部署工具",
    subtitle:
      "galaxy-ops 部署工具包（网关执行器 `gops prj upgrade` 依赖）。多平台：一次录入三平台。",
    artifactPlaceholder:
      "https://artifacts.example.com/galaxy-ops/v0.18.2-aarch64-apple-darwin.tar.gz",
    platforms: THREE_PLATFORMS,
  },
  {
    component: "galaxy-flow",
    name: "galaxy-flow",
    tagline: "工作流工具",
    subtitle: "galaxy-flow 工作流工具包。多平台：一次录入三平台。",
    artifactPlaceholder:
      "https://artifacts.example.com/galaxy-flow/v0.15.1-aarch64-apple-darwin.tar.gz",
    platforms: THREE_PLATFORMS,
  },
];
