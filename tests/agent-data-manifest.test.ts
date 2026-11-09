// 契约测试：Agent 数据清单归一化（`data_manifest`）。
//
// 中心页只读这一份清单：`null` = 网关还没上报（显示“还没上报”），`[]` = 确实没有数据。
// 两者不能混。后端是 snake_case，前端视图是 camelCase；两者都要能读。
//
// Usage: npm run test:agent-data-manifest

// 假 window —— 必须在 import 前就位（`createAdminAuth` 会在求值时读它）。
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  },
  dispatchEvent: () => true,
};
globalThis.fetch = async () => Response.json({});

const { normalizeAgentDataManifest } = await import("../src/api/admin");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 1) 没上报 / 非对象 → `null`（不是空清单）。
for (const payload of [undefined, null, [], "x", 42]) {
  assert(
    normalizeAgentDataManifest(payload) === null,
    `非对象载荷必须归一成 null，got: ${JSON.stringify(payload)}`,
  );
}

// 2) 后端 snake_case：字段名与嵌套都要读对；空说明折成 null。
const snake = normalizeAgentDataManifest({
  collected_at: "2026-01-01T00:00:00Z",
  collection: [
    {
      family: "HostMetrics",
      work_id: "w-1",
      status: "active",
      plan_version: 2,
      acknowledged_version: 2,
      collection_status: "ok",
      collection_detail: "",
      inputs: [{ kind: "MetricInterval", target: "15s" }],
    },
  ],
  investigations: [
    {
      command_id: "c-1",
      topic: "disk",
      observed_at: "2026-01-01T00:01:00Z",
      overall: "warn",
      verdict: "Warn",
      findings_ok: 3,
      findings_warn: 1,
      findings_fail: 0,
      findings_unknown: 2,
      judged: false,
    },
  ],
});
assert(snake !== null, "对象载荷必须归一成清单");
assert(
  snake.collectedAt === "2026-01-01T00:00:00Z",
  "collected_at 是必需的非空时间",
);
assert(snake.collection.length === 1, "collection 应有 1 条");
const entry = snake.collection[0];
assert(entry.family === "HostMetrics", `family 读错: ${entry.family}`);
assert(entry.workId === "w-1", `work_id 没映射成 workId: ${entry.workId}`);
assert(entry.planVersion === 2, `plan_version 没映射: ${entry.planVersion}`);
assert(
  entry.acknowledgedVersion === 2,
  `acknowledged_version 没映射: ${entry.acknowledgedVersion}`,
);
assert(entry.collectionStatus === "ok", `collection_status 没映射`);
// 空白说明不是信息：必须折成 null，否则页面会渲染一段空白。
assert(
  entry.collectionDetail === null,
  `空白 collection_detail 必须折成 null: ${JSON.stringify(entry.collectionDetail)}`,
);
assert(entry.inputs[0].kind === "MetricInterval", "来源 kind 读错");
assert(entry.inputs[0].target === "15s", "来源 target 读错");
const investigation = snake.investigations[0];
assert(
  investigation.commandId === "c-1",
  `command_id 没映射: ${investigation.commandId}`,
);
assert(investigation.findingsUnknown === 2, "findings_unknown 没映射");
assert(investigation.judged === false, "显式 judged=false 必须保留");

// 3) camelCase（前端示例 / 未来 API 直接给视图）同样能读。
const camel = normalizeAgentDataManifest({
  collectedAt: "2026-01-01T00:00:00Z",
  collection: [
    {
      family: "F",
      workId: "w",
      status: "paused",
      planVersion: 1,
      acknowledgedVersion: null,
      collectionStatus: null,
      collectionDetail: null,
      inputs: [],
    },
  ],
  investigations: [
    {
      commandId: "c",
      topic: "load",
      observedAt: "2026-01-01T00:01:00Z",
      overall: "ok",
      verdict: "Ok",
      findingsOk: 1,
      findingsWarn: 0,
      findingsFail: 0,
      findingsUnknown: 0,
      // 缺 judged（老报告）→ 按网关报告读取口径当 `true`，不能误标成“仅证据”。
    },
  ],
});
assert(camel !== null, "camelCase 也要能读");
assert(camel.collection[0].workId === "w", "camelCase workId 读错");
assert(
  camel.collection[0].collectionStatus === null,
  "camelCase collectionStatus 读错",
);
assert(
  camel.investigations[0].judged === true,
  "缺 judged 时必须按 true 处理（老报告默认做判定）",
);

// 4) 缺两个列表 → 空表（不崩、也不当成“没上报”）。
const empty = normalizeAgentDataManifest({});
assert(empty !== null, "空对象仍是“已上报的空清单”");
assert(empty.collection.length === 0, "缺 collection → 空表");
assert(empty.investigations.length === 0, "缺 investigations → 空表");

// 5) 列表里混入非对象：逐条丢弃，不让一条坏数据击穿整张清单。
const mixed = normalizeAgentDataManifest({
  collection: [null, 1, { family: "F" }],
  investigations: ["x"],
});
assert(mixed !== null, "坏条目不应让整份清单变 null");
assert(mixed.collection.length === 1, "只保留对象条目");
assert(mixed.investigations.length === 0, "investigations 里的非对象要丢掉");

console.log("agent data manifest contract test passed");
