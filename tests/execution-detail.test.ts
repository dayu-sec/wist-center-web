// 契约测试：逐目标执行反馈的「消息 / 日志路径」拆分。
//
// 这条反馈会直接进发布执行页的逐台列表；路径一旦和消息挤在一行，长路径会把整行撑爆，
// 所以拆分口径要钉住：日志段各种写法都要认，没日志段时回落到条目自带的 logDir。

import { splitExecutionDetail } from "../src/components/executionDetail";

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(`FAIL: ${message}`);
}

const withLog = splitExecutionDetail(
  "executor exit status: 0; 未佐证（读不到长期身份）；日志: /Users/me/tasks/upgrade-plan-1-20261022-012450",
  null,
);
check(
  withLog.message === "executor exit status: 0; 未佐证（读不到长期身份）",
  `消息未剥离日志：${withLog.message}`,
);
check(
  withLog.logPath === "/Users/me/tasks/upgrade-plan-1-20261022-012450",
  `日志路径不对：${withLog.logPath}`,
);

const colon = splitExecutionDetail("失败；日志目录：/tmp/run", "/tmp/other");
check(colon.message === "失败", "中文冒号 / 日志目录未识别");
check(colon.logPath === "/tmp/run", "应优先用 detail 里的日志路径");

const fallback = splitExecutionDetail("未读到长期身份", "/tmp/run");
check(fallback.message === "未读到长期身份", "无日志段的消息不应被改动");
check(fallback.logPath === "/tmp/run", "无日志段时应回落到 logDir");

const empty = splitExecutionDetail("", null);
check(empty.message === "" && empty.logPath === null, "空反馈应为空消息 + 空路径");

const onlyLog = splitExecutionDetail("日志：/tmp/run", null);
check(onlyLog.message === "" && onlyLog.logPath === "/tmp/run", "纯日志段应拆成空消息");

console.log("execution detail contract test passed");
