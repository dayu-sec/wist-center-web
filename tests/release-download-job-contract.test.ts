import {
  cancelJob,
  fetchReleaseJob,
  fetchReleaseJobs,
  isReleaseJobTerminal,
  publishRelease,
  publishReleaseBatch,
} from "../src/api/admin";

// 契约测试：远程包下载任务的异步化。
//
// 发布端点不再在一次请求里下载；前端带 `Prefer: respond-async` 只入队（202 + job），
// 再按 job 轮询。这里锁住四件容易漂移的事：
//   1. 发布端点：路径 / 方法 / `Prefer: respond-async` 头；
//   2. 任务形状归一化：snake_case → camelCase（含 `package` / `error_*` / 时间）；
//   3. 任务查询 / 列表路径（列表带 `component` 过滤）；
//   4. 旧中心同步返回安装包时折成「已完成任务」，前端不分叉两个形状；失败必须抛错。
//
// Usage: npm run test:release-download-job

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

interface Recorded {
  url: string;
  method: string;
  body: string;
  prefer: string;
}

let recorded: Recorded[] = [];
let responder: () => Response = () => Response.json({});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  recorded.push({
    url: input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
    body: typeof init?.body === "string" ? init.body : "",
    prefer: headers.get("prefer") ?? "",
  });
  return responder();
};

const job = {
  job_id: "rel-wist-agentd-1-0",
  component: "wist-agentd",
  kind: "publish",
  state: "running",
  requested_by: "admin",
  declared_version: null,
  artifacts: [
    {
      artifact_url: "https://example/wist-agentd-0.1.9.tar.gz",
      expected_sha256: "a".repeat(64),
    },
  ],
  package: null,
  error_code: null,
  error_status: null,
  error_detail: null,
  created_at: "2026-10-28T00:00:00+00:00",
  started_at: "2026-10-28T00:00:01+00:00",
  finished_at: null,
};

// --- 1. 单制品发布：POST + Prefer: respond-async ---------------------------
recorded = [];
responder = () => Response.json(job, { status: 202 });
const queued = await publishRelease("wist-agentd", {
  artifactUrl: "https://example/wist-agentd-0.1.9.tar.gz",
  expectedSha256: "a".repeat(64),
  requestedBy: "admin",
});
assert(recorded.length === 1, `发布应只发一次请求，实际 ${recorded.length}`);
assert(
  recorded[0].url === "/api/v1/admin/releases/wist-agentd",
  `发布路径不对：${recorded[0].url}`,
);
assert(recorded[0].method === "POST", `发布必须是 POST：${recorded[0].method}`);
assert(
  recorded[0].prefer === "respond-async",
  `发布必须带 Prefer: respond-async：${String(recorded[0].prefer)}`,
);
assert(queued.source === "real", "发布是写操作，不能回落示例数据");
assert(
  queued.data.jobId === job.job_id,
  `job_id 未归一化：${queued.data.jobId}`,
);
assert(queued.data.state === "running", `state 不对：${queued.data.state}`);
assert(
  queued.data.artifacts[0].artifactUrl === job.artifacts[0].artifact_url,
  "artifacts 未归一化",
);
assert(queued.data.startedAt === job.started_at, "started_at 未归一化");

// --- 2. 批量发布：同一套异步契约 -------------------------------------------
recorded = [];
responder = () =>
  Response.json({ ...job, kind: "publish_batch" }, { status: 202 });
const batch = await publishReleaseBatch("galaxy-ops", {
  requestedBy: "admin",
  artifacts: [
    { artifactUrl: "https://example/a.tar.gz", expectedSha256: "b".repeat(64) },
    { artifactUrl: "https://example/b.tar.gz", expectedSha256: "c".repeat(64) },
  ],
});
assert(
  recorded[0].url === "/api/v1/admin/releases/galaxy-ops/batch",
  `批量发布路径不对：${recorded[0].url}`,
);
assert(
  recorded[0].prefer === "respond-async",
  "批量发布也要带 Prefer: respond-async",
);
const body = JSON.parse(recorded[0].body);
assert(body.artifacts.length === 2, `批量 artifacts 丢失：${recorded[0].body}`);
assert(
  batch.data.kind === "publish_batch",
  `kind 未归一化：${batch.data.kind}`,
);

// --- 3. 任务查询 / 列表 ----------------------------------------------------
recorded = [];
responder = () => Response.json({ ...job, state: "succeeded" });
const one = await fetchReleaseJob("rel-wist-agentd-1-0");
assert(
  recorded[0].url === "/api/v1/admin/release-jobs/rel-wist-agentd-1-0",
  `任务查询路径不对：${recorded[0].url}`,
);
assert(
  recorded[0].method === "GET",
  `任务查询必须是 GET：${recorded[0].method}`,
);
assert(one.state === "succeeded", `任务状态不对：${one.state}`);

recorded = [];
responder = () => Response.json([{ ...job, state: "queued" }]);
const list = await fetchReleaseJobs("wist-agentd");
assert(
  recorded[0].url ===
    "/api/v1/admin/release-jobs?limit=20&component=wist-agentd",
  `任务列表路径不对：${recorded[0].url}`,
);
assert(
  list.length === 1 && list[0].state === "queued",
  `任务列表形状不对：${recorded[0].url}`,
);

// 轮询停止条件：只有明确终态才停；未知 / 中间态继续问。
assert(isReleaseJobTerminal("succeeded"), "succeeded 是终态");
assert(isReleaseJobTerminal("failed"), "failed 是终态");
assert(isReleaseJobTerminal("canceled"), "canceled 是终态");
assert(!isReleaseJobTerminal("queued"), "queued 不是终态");
assert(!isReleaseJobTerminal("running"), "running 不是终态");
assert(
  !isReleaseJobTerminal("retrying"),
  "未知中间态不能被当成终态（否则会把还在跑的任务提前结束）",
);

// --- 4b. 取消：POST 通用任务端点，无 body ------------------------------
recorded = [];
responder = () => Response.json({ ...job, state: "canceled" });
await cancelJob("job-release-download-1-0");
assert(
  recorded[0].url === "/api/v1/admin/jobs/job-release-download-1-0/cancel",
  `取消失败路径不对：${recorded[0].url}`,
);
assert(recorded[0].method === "POST", `取消必须是 POST：${recorded[0].method}`);
assert(recorded[0].body === "", `取消不该带 body：${recorded[0].body}`);

// 取消后的任务形状：状态 `canceled` 要能归一化，并按终态停止轮询。
recorded = [];
responder = () =>
  Response.json({
    ...job,
    state: "canceled",
    finished_at: "2026-10-28T00:02:00+00:00",
  });
const canceledJob = await fetchReleaseJob("job-release-download-1-0");
assert(
  canceledJob.state === "canceled",
  `取消状态未保留：${canceledJob.state}`,
);
assert(isReleaseJobTerminal(canceledJob.state), "canceled 必须算终态");

// --- 4. 旧中心同步回安装包 → 折成「已完成任务」 ----------------------------
recorded = [];
responder = () =>
  Response.json({
    component: "wist-gateway-stack",
    version: "0.1.28",
    artifacts: [
      {
        platform: null,
        sha256: "d".repeat(64),
        source:
          "https://center/api/v1/releases/artifact/wist-gateway-stack/0.1.28/pkg.tar.gz",
      },
    ],
    status: "published",
    published_at: "2026-10-28T00:00:00+00:00",
  });
const legacy = await publishRelease("wist-gateway-stack", {
  artifactUrl: "https://example/pkg.tar.gz",
  expectedSha256: "d".repeat(64),
  requestedBy: "admin",
});
assert(legacy.data.state === "succeeded", "旧中心同步回执应折成已完成任务");
assert(legacy.data.package?.version === "0.1.28", "旧中心回执的安装包应保留");
assert(legacy.data.package?.artifacts.length === 1, "旧中心回执的制品应保留");

// --- 5. 写操作不回落示例：失败必须抛错 --------------------------------------
recorded = [];
responder = () =>
  Response.json(
    { error: { code: "release_job_create_failed" } },
    { status: 500 },
  );
let rejected = false;
try {
  await publishRelease("wist-agentd", {
    artifactUrl: "https://example/x.tar.gz",
    expectedSha256: "e".repeat(64),
    requestedBy: "admin",
  });
} catch {
  rejected = true;
}
assert(rejected, "入队失败必须抛错，不能伪装成成功回执");

console.log("release download job contract: OK");
