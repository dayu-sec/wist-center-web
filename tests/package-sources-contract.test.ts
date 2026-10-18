// 契约测试：安装包来源（`GET /api/v1/admin/package-sources`）。
//
// 录入页的「按版本号检查」完全依赖这份配置：拼 URL 的前缀（GitHub owner/repo、COS 桶/前缀）
// 一旦字段名或形状漂了，页面会退回手工粘贴，而且不会报错。钉住：
//   1. GET 路径与 Bearer 凭据；
//   2. snake_case → camelCase（github_repo → githubRepo、cos_bucket → cosBucket…）；
//   3. 缺省/空配置 → 空数组（页面回落到手工地址），不是抛错。

const TOKEN = "admin-token-under-test";
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  },
  dispatchEvent: () => true,
};

interface Recorded {
  url: string;
  method: string;
  authorization: string;
}

let recorded: Recorded[] = [];
let responder: () => Response = () =>
  Response.json({
    sources: [
      {
        component: "wist-agentd",
        github_repo: "dayu-sec/wist-agentd",
        cos_bucket: "github-1347593047",
        cos_prefix: "wist-agentd",
        cos_region: "ap-hongkong",
      },
      {
        component: "galaxy-ops",
        github_repo: "galaxio-labs/galaxy-ops",
        cos_bucket: null,
        cos_prefix: "galaxy-ops",
        cos_region: null,
      },
    ],
  });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  recorded.push({
    url: input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
    authorization: headers.get("authorization") ?? "",
  });
  return responder();
};

const { composePackageSourceUrl } = await import("../src/components/packageSourceUrl");
const { fetchPackageLatest, fetchPackageSources, setAdminApiToken } =
  await import("../src/api/admin");
setAdminApiToken(TOKEN);

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(`FAIL: ${message}`);
}

recorded = [];
const sources = await fetchPackageSources();
check(recorded.length === 1, `应只发一个请求，实际 ${recorded.length}`);
const call = recorded[0];
check(call.url === "/api/v1/admin/package-sources", `路径不对：${call.url}`);
check(call.method === "GET", `方法应为 GET，实际 ${call.method}`);
check(
  call.authorization === `Bearer ${TOKEN}`,
  "管理凭据应走 Authorization Header",
);

check(sources.length === 2, `应解析出 2 条来源，实际 ${sources.length}`);
const [agentd, galaxy] = sources;
check(
  agentd.component === "wist-agentd" &&
    agentd.githubRepo === "dayu-sec/wist-agentd" &&
    agentd.cosBucket === "github-1347593047" &&
    agentd.cosPrefix === "wist-agentd" &&
    agentd.cosRegion === "ap-hongkong",
  `agentd 来源字段未归一化：${JSON.stringify(agentd)}`,
);
// 未配置 COS 的组件：bucket/region 必须是 null，不是 undefined。
check(
  galaxy.cosBucket === null && galaxy.cosRegion === null,
  "缺省字段必须归一化为 null",
);

// 空配置（后端没配 [[packages.sources]]）→ 空数组，页面回落到手工地址。
responder = () => Response.json({ sources: [] });
const empty = await fetchPackageSources();
check(empty.length === 0, "空配置应返回空数组");

// 自动探测最新版本：查询参数、响应归一化、up_to_date 形态。
responder = () =>
  Response.json({
    component: "wist-agentd",
    source: "github",
    base_version: "v0.3.0-alpha",
    version: "v0.5.0-alpha",
    imported: false,
    up_to_date: false,
    assets: [
      {
        name: "wist-agentd-v0.5.0-alpha-aarch64-apple-darwin.tar.gz",
        artifact_url:
          "https://github.com/dayu-sec/wist-agentd/releases/download/v0.5.0-alpha/wist-agentd-v0.5.0-alpha-aarch64-apple-darwin.tar.gz",
        sha256: "02d8f636842ac26a6cb67586d5c96366456448811c33d6b173d427f29b67084b",
        platform: "aarch64-apple-darwin",
      },
    ],
  });
recorded = [];
const latest = await fetchPackageLatest("wist-agentd", "v0.3.0-alpha", "github");
check(recorded.length === 1, `探测最新应只发一个请求，实际 ${recorded.length}`);
const latestCall = recorded[0];
check(
  latestCall.url ===
    "/api/v1/admin/package-sources/latest?component=wist-agentd&base_version=v0.3.0-alpha&source=github",
  `探测路径/参数不对：${latestCall.url}`,
);
check(
  latest.version === "v0.5.0-alpha" &&
    latest.baseVersion === "v0.3.0-alpha" &&
    latest.source === "github" &&
    latest.imported === false &&
    latest.upToDate === false,
  `探测结果未归一化：${JSON.stringify(latest)}`,
);
check(
  latest.assets.length === 1 &&
    latest.assets[0].platform === "aarch64-apple-darwin" &&
    latest.assets[0].sha256?.startsWith("02d8"),
  "探测结果的 assets 未归一化",
);

responder = () =>
  Response.json({
    component: "wist-agentd",
    source: "github",
    base_version: "v0.5.0-alpha",
    version: "v0.5.0-alpha",
    imported: true,
    up_to_date: true,
    assets: [],
  });
const upToDate = await fetchPackageLatest("wist-agentd", "v0.5.0-alpha", "github");
check(
  upToDate.upToDate === true && upToDate.assets.length === 0,
  "up_to_date 形态应保留空 assets",
);

// 版本号 + 配置 → 解析接口地址（页面「检查 URL」拼的就是它）。
check(
  composePackageSourceUrl(agentd, "github", "v0.3.0-alpha") ===
    "https://github.com/dayu-sec/wist-agentd/releases/tag/v0.3.0-alpha",
  "GitHub 地址拼接不对",
);
check(
  composePackageSourceUrl(agentd, "cos", "v0.3.0-alpha") ===
    "https://github-1347593047.cos.ap-hongkong.myqcloud.com/wist-agentd/v0.3.0-alpha",
  "配了 region 的 COS 应拼虚拟主机地址",
);
check(
  composePackageSourceUrl({ ...agentd, cosRegion: null }, "cos", "v0.3.0-alpha") ===
    "github-1347593047/wist-agentd/v0.3.0-alpha",
  "无 region 的 COS 应拼桶/前缀/版本",
);
check(
  composePackageSourceUrl(undefined, "github", "v0.3.0-alpha") === "",
  "没有配置时不应拼出地址",
);
check(
  composePackageSourceUrl(agentd, "cos", "  ") === "",
  "版本为空时不应拼出地址",
);

// 版本号两端空白要被裁掉（表单里常带空格）。
check(
  composePackageSourceUrl(agentd, "github", "  v0.3.0-alpha  ") ===
    "https://github.com/dayu-sec/wist-agentd/releases/tag/v0.3.0-alpha",
  "版本号两端空白应被裁掉",
);

// 只配了 COS 的组件：GitHub 侧不能拼出地址；只配了 GitHub 的组件：COS 缺 prefix 也不能拼。
check(
  composePackageSourceUrl({ ...agentd, githubRepo: null }, "github", "v0.3.0-alpha") === "",
  "没有 githubRepo 时不应拼 GitHub 地址",
);
check(
  composePackageSourceUrl({ ...agentd, cosPrefix: null }, "cos", "v0.3.0-alpha") === "",
  "COS 缺 prefix 时不应拼地址",
);

// 自动探测：没有 base/source 时不要把空参数带上去。
recorded = [];
responder = () =>
  Response.json({
    component: "wist-agentd",
    source: "github",
    base_version: null,
    version: "v0.5.0-alpha",
    imported: false,
    up_to_date: false,
    assets: [],
  });
await fetchPackageLatest("wist-agentd");
check(
  recorded[0].url === "/api/v1/admin/package-sources/latest?component=wist-agentd",
  `无 base/source 时参数不对：${recorded[0].url}`,
);

// 后端返回未知 source 时归一化为 github（前端类型只允许 github|cos）。
responder = () =>
  Response.json({
    component: "wist-agentd",
    source: "unknown",
    base_version: null,
    version: "v0.5.0-alpha",
    imported: true,
    up_to_date: true,
    assets: [],
  });
const unknownSource = await fetchPackageLatest("wist-agentd");
check(unknownSource.source === "github", "未知 source 应归一化为 github");
check(unknownSource.baseVersion === null, "base_version 缺省应为 null");
check(
  unknownSource.imported === true && unknownSource.upToDate === true,
  "imported / up_to_date 应保留",
);

// 配置里 component 为空的项要被过滤（页面不能拿它拼地址）。
responder = () =>
  Response.json({
    sources: [
      { component: "", github_repo: "x/y" },
      { component: "wist-agentd", github_repo: "dayu-sec/wist-agentd" },
    ],
  });
const filtered = await fetchPackageSources();
check(filtered.length === 1 && filtered[0].component === "wist-agentd", "空 component 应被过滤");

console.log("package sources contract test passed");
