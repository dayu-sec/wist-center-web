import { cancelJob, fetchJobs, isAdminJobTerminal } from "../src/api/admin";

// 契约测试：任务队列页（`GET /api/v1/admin/jobs`）。
//
// 锁住四件容易漂移的事：
//   1. 端点与查询参数：`queue` / `kind` / `state` / `subject` / `limit`（空值不带上）；
//   2. 后端 `JobRecord` 的 snake_case 要归一化成页面用的 camelCase（`job_id` / `error_code` …）；
//   3. `progress` 是嵌套对象，缺字段时按 0 / null 兜底，不能让整页炸；
//   4. 取消走通用端点 `POST /api/v1/admin/jobs/{id}/cancel`，且 `canceled` 算终态（轮询要停）。
//
// Usage: npm run test:admin-jobs

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

interface Recorded {
  url: string;
  method: string;
}

let recorded: Recorded[] = [];
let responder: () => Response = () => Response.json({});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  recorded.push({
    url: input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
  });
  return responder();
};

// 后端 `infra::jobs::JobRecord` 的原样形状（snake_case + 嵌套 progress）。
const rawJob = {
  job_id: "job-release-download-7-0",
  kind: "release-download",
  queue: "release-download",
  subject: "wist-agentd",
  state: "failed",
  priority: 0,
  payload: { component: "wist-agentd" },
  result: null,
  progress: { completed: 1, total: 3, message: "镜像 1/3 失败" },
  error_code: "artifact_fetch_failed",
  error_status: 502,
  error_detail: "download failed",
  created_at: "2026-10-28T01:00:00+00:00",
  started_at: "2026-10-28T01:00:01+00:00",
  finished_at: "2026-10-28T01:00:05+00:00",
};

// --- 1. 列表：参数与归一化 ------------------------------------------------
recorded = [];
responder = () => Response.json([rawJob]);
const jobs = await fetchJobs({
  queue: "release-download",
  state: "failed",
  subject: "wist-agentd",
  limit: 7,
});

assert(recorded.length === 1, `应只发一次请求：${recorded.length}`);
assert(
  recorded[0].url.startsWith("/api/v1/admin/jobs?"),
  `任务列表端点不对：${recorded[0].url}`,
);
for (const expected of [
  "queue=release-download",
  "state=failed",
  "subject=wist-agentd",
  "limit=7",
]) {
  assert(recorded[0].url.includes(expected), `缺少查询参数 ${expected}：${recorded[0].url}`);
}

assert(jobs.length === 1, `应解析出 1 条任务：${jobs.length}`);
const job = jobs[0];
assert(job.jobId === rawJob.job_id, `job_id 未归一化：${job.jobId}`);
assert(job.queue === "release-download", `queue 不对：${job.queue}`);
assert(job.kind === "release-download", `kind 不对：${job.kind}`);
assert(job.subject === "wist-agentd", `subject 不对：${job.subject}`);
assert(job.state === "failed", `state 不对：${job.state}`);
assert(job.progress.completed === 1 && job.progress.total === 3, "progress 未解析");
assert(job.progress.message === "镜像 1/3 失败", `progress.message 不对：${job.progress.message}`);
assert(job.errorCode === "artifact_fetch_failed", `error_code 未归一化：${job.errorCode}`);
assert(job.errorStatus === 502, `error_status 不对：${job.errorStatus}`);
assert(job.errorDetail === "download failed", `error_detail 不对：${job.errorDetail}`);
assert(job.finishedAt === rawJob.finished_at, `finished_at 未归一化：${job.finishedAt}`);

// --- 2. 空过滤条件不上 URL ------------------------------------------------
recorded = [];
responder = () => Response.json([]);
await fetchJobs({ queue: "  ", state: "" });
assert(
  recorded[0].url === "/api/v1/admin/jobs?limit=50",
  `空过滤条件不应出现在 URL：${recorded[0].url}`,
);

// --- 3. 缺 progress 字段不炸 ----------------------------------------------
recorded = [];
responder = () =>
  Response.json([{ ...rawJob, progress: {}, started_at: null, error_code: null }]);
const sparse = (await fetchJobs())[0];
assert(
  sparse.progress.completed === 0 &&
    sparse.progress.total === 0 &&
    sparse.progress.message === null,
  "progress 缺字段时应兜底为 0 / null",
);
assert(sparse.startedAt === null, `started_at 缺省应为 null：${sparse.startedAt}`);
assert(sparse.errorCode === null, `error_code 缺省应为 null：${sparse.errorCode}`);

// --- 4. 终态判定 -----------------------------------------------------------
for (const state of ["succeeded", "failed", "canceled"]) {
  assert(isAdminJobTerminal(state), `${state} 必须是终态`);
}
for (const state of ["queued", "running", "retrying", ""]) {
  assert(!isAdminJobTerminal(state), `${state} 不能算终态（轮询要继续）`);
}

// --- 5. 取消端点 -----------------------------------------------------------
recorded = [];
responder = () => Response.json({ ...rawJob, state: "canceled" });
await cancelJob("job-release-download-7-0");
assert(recorded[0].method === "POST", `取消必须是 POST：${recorded[0].method}`);
assert(
  recorded[0].url === "/api/v1/admin/jobs/job-release-download-7-0/cancel",
  `取消端点不对：${recorded[0].url}`,
);

console.log("admin jobs contract: OK");
