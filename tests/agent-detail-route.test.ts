// 契约测试：Agent 详情的地址口径（`/gateways/:id/agents/:agentId`）。
//
// 为什么值得钉：详情是**独立路由**（刷新 / 分享 / 后退都要回到同一台 Agent），
// 地址拼错时页面会静默落到网关详情或 404 —— 类型系统看不出来，只能靠这条用例。
// 另一条：agentId / gatewayId 都来自接口，可能带 `/`、`#`、`?`、中文，两段必须各自编码，
// 否则一条脏 id 就能把路径切成别的路由。
//
// Usage: npm run test:agent-detail-route

const { agentListPath, agentDetailPath } = await import(
  "../src/components/agentRoutes"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1) 基本形状：列表在 `/agents`，详情在其下一层。
assert(
  agentListPath("gw-1") === "/gateways/gw-1/agents",
  `列表路径不对：${agentListPath("gw-1")}`,
);
assert(
  agentDetailPath("gw-1", "agent-host-a55a338d7723") ===
    "/gateways/gw-1/agents/agent-host-a55a338d7723",
  `详情路径不对：${agentDetailPath("gw-1", "agent-host-a55a338d7723")}`,
);

// 2) 详情必须以列表路径为前缀 —— 返回链接与详情链接指向同一棵子树。
const detail = agentDetailPath("gw-1", "a1");
assert(
  detail.startsWith(`${agentListPath("gw-1")}/`),
  `详情不是列表的子路径：list=${agentListPath("gw-1")} detail=${detail}`,
);

// 3) 编码：两段都编，且段内分隔符不会漏成路由分隔符。
const dirty = agentDetailPath("gw/1", "a/b c#d?e%f中文");
assert(
  dirty === `/gateways/gw%2F1/agents/a%2Fb%20c%23d%3Fe%25f%E4%B8%AD%E6%96%87`,
  `编码不对：${dirty}`,
);
assert(
  dirty.split("/").length === 5,
  `脏 id 把路径切成了更多段：${dirty}`,
);
assert(!dirty.includes(" "), `空格没编码：${dirty}`);
assert(!dirty.includes("#") && !dirty.includes("?"), `# / ? 没编码：${dirty}`);

// 4) 列表路径同样编码 gatewayId（它来自路径参数，会被原样拼回去）。
assert(
  agentListPath("gw 1") === "/gateways/gw%201/agents",
  `列表路径没编码 gatewayId：${agentListPath("gw 1")}`,
);

// 5) 幂等：同样的入参永远同一串（路由键 / 链接去重靠这个）。
assert(
  agentDetailPath("g", "a") === agentDetailPath("g", "a"),
  "同一入参生成了不同路径",
);

console.log("agent detail route contract test passed");
