// 契约测试：开放面「接口可用性」的纯函数（`openApiHealth.ts`）。
//
// 三条纪律：
//   1. 接口清单只来自后端 spec，页面不写死路径；
//   2. curl 示例必须包含方法 / 基地址 / 鉴权头；POST 还要 Idempotency-Key 与请求体；
//   3. `$ref` 要能解析到 components.schemas，否则请求体字段表会是空的。
//
// Usage: npm run test:open-api-health

import type { OpenApiDocument } from "../src/api";
import {
  curlForOperation,
  isSecured,
  operationsOf,
  parameterRows,
  requestBodyExample,
  responseSummary,
  schemaFields,
  typeName,
} from "../src/components/openApiHealth";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const document: OpenApiDocument = {
  openapi: "3.1.0",
  info: { title: "WistCenter 第三方调查 API", version: "0.35.3" },
  servers: [{ url: "https://open.example.com" }],
  security: [{ bearer: [] }],
  paths: {
    "/api/v1/open/capabilities": {
      get: {
        summary: "列出可用的调查能力",
        responses: { "200": { description: "调查题面清单" } },
      },
    },
    "/api/v1/open/investigation-grants": {
      get: {
        summary: "按客户 + 主机 IP 查调查授权",
        parameters: [
          {
            name: "customer_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "host_ip",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "匹配到的 agent 及其调查授权" } },
      },
    },
    "/api/v1/open/investigations": {
      post: {
        summary: "发起一次调查",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OpenLaunchInvestigationRequest",
              },
              example: {
                customer_id: "cust-1024",
                host_ip: "192.168.1.5",
                topic: "disk",
                external_ref: "case-2026-0001",
              },
            },
          },
        },
        responses: {
          "202": { description: "已受理" },
          "400": { description: "参数不合法" },
        },
      },
    },
    "/api/v1/open/investigations/{command_id}": {
      get: {
        summary: "查任务状态",
        parameters: [
          {
            name: "command_id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "任务状态" } },
      },
    },
  },
  components: {
    schemas: {
      OpenLaunchInvestigationRequest: {
        type: "object",
        required: ["customer_id", "host_ip", "topic"],
        properties: {
          customer_id: {
            type: "string",
            description: "客户 id",
            example: "cust-1024",
          },
          host_ip: {
            type: "string",
            description: "主机 IP",
            example: "192.168.1.5",
          },
          topic: {
            type: "string",
            enum: ["disk", "load"],
            description: "调查题面",
            example: "disk",
          },
          external_ref: { type: "string", description: "调用方工单号" },
        },
      },
    },
  },
};

// 1) 路径 × 方法：四条接口，按路径排序，方法顺序固定。
const operations = operationsOf(document);
assert(operations.length === 4, `应有 4 个接口，实际 ${operations.length}`);
const order = operations.map((entry) => `${entry.method}:${entry.path}`);
assert(
  order.join(",") ===
    [
      "get:/api/v1/open/capabilities",
      "get:/api/v1/open/investigation-grants",
      "post:/api/v1/open/investigations",
      "get:/api/v1/open/investigations/{command_id}",
    ].join(","),
  `排序不对：${order.join(",")}`,
);

// 2) `$ref` 解析 + 必填标记。
const post = operations[2].operation;
const media = post.requestBody?.content?.["application/json"];
const fields = schemaFields(media?.schema, document);
assert(fields.length === 4, `请求体应有 4 个字段，实际 ${fields.length}`);
const required = fields.filter((field) => field.required).map((field) => field.name);
assert(
  required.includes("customer_id") &&
    required.includes("host_ip") &&
    required.includes("topic"),
  `customer_id / host_ip / topic 必填，实际 ${required.join(",")}`,
);
assert(
  fields.find((field) => field.name === "topic")?.type === "enum(disk | load)",
  "enum 要展开成可读类型",
);
assert(
  typeName({ type: "array", items: { type: "string" } }, document) ===
    "array<string>",
  "数组类型要展开",
);

// 3) 请求体示例：优先用 spec 的 example；必须是按客户 + IP 寻址。
const example = requestBodyExample(post, document);
assert(example !== null, "POST 应有请求体示例");
assert(
  example!.includes('"customer_id": "cust-1024"') &&
    example!.includes('"host_ip": "192.168.1.5"'),
  `示例缺按客户 + IP 寻址：${example}`,
);
assert(example!.includes('"topic": "disk"'), `示例缺 topic：${example}`);

// 4) curl：方法 / 基地址 / 鉴权 / 幂等键 / 请求体；路径参数写成占位符。
const postCurl = curlForOperation({
  method: "post",
  path: "/api/v1/open/investigations",
  baseUrl: "https://open.example.com/",
  example,
  token: "wcr_case_token",
});
assert(
  postCurl.includes(
    "curl -s -X POST 'https://open.example.com/api/v1/open/investigations'",
  ),
  postCurl,
);
assert(postCurl.includes('authorization: Bearer wcr_case_token'), postCurl);
assert(postCurl.includes("idempotency-key: <uuid>"), postCurl);
assert(postCurl.includes("-d '"), postCurl);

const getCurl = curlForOperation({
  method: "get",
  path: "/api/v1/open/investigations/{command_id}",
  baseUrl: "https://open.example.com",
});
assert(
  getCurl.includes(
    "'https://open.example.com/api/v1/open/investigations/<command_id>'",
  ),
  getCurl,
);
assert(
  getCurl.includes("authorization: Bearer <wcr_…>"),
  "没填令牌时要用占位符，不能伪造一个 token",
);
assert(!getCurl.includes("idempotency-key"), "GET 不应带幂等键");
assert(!getCurl.includes("-d '"), "GET 不应带请求体");

// 5) 鉴权 / 参数 / 响应摘要。
assert(isSecured(post, document), "文档级 security 应让操作需要令牌");
const params = parameterRows(post, document);
assert(
  params.length === 1 && params[0].parameter.in === "header",
  "Idempotency-Key 应是 header 参数",
);
assert(
  responseSummary(post).includes("202 已受理"),
  `响应摘要缺 202：${responseSummary(post)}`,
);

console.log("open-api-health: ok");
