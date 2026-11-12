//! 开放面「接口可用性」页的纯函数：接口清单 → 行 / 类型名 / curl 示例。
//!
//! 抽出来的原因和别处的 presentation 模块一样：契约测试可以直接跑这些函数，
//! 不需要挂 React；页面只负责把它们排进 DOM。
//!
//! 接口清单**只来自后端**（`GET /api/v1/admin/open-api` 的 `openapi`），
//! 这里不写死任何路径 / 参数 —— 否则又变成第二份真源。

import type {
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSchema,
} from "../api";

/** 方法顺序固定：同一路径上的多个方法按 HTTP 语义排，而不是字母序。 */
export const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface OperationEntry {
  path: string;
  method: string;
  operation: OpenApiOperation;
}

/** 把 spec 的 `paths` 摄平成「路径 × 方法」。 */
export function operationsOf(
  document: OpenApiDocument | null | undefined,
): OperationEntry[] {
  return Object.entries(document?.paths ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([path, item]) =>
      METHODS.filter((method) => item[method]).map((method) => ({
        path,
        method,
        operation: item[method],
      })),
    );
}

/** `$ref` 解析到 components.schemas；解析不到就原样返回。 */
export function resolveSchema(
  schema: OpenApiSchema | undefined,
  document: OpenApiDocument | null | undefined,
): OpenApiSchema | undefined {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.split("/").pop();
  if (!name) return schema;
  return document?.components?.schemas?.[name] ?? schema;
}

/** `$ref` 只显名字；数组 / 组合类型就地展开。 */
export function typeName(
  schema: OpenApiSchema | undefined,
  document?: OpenApiDocument | null,
): string {
  if (!schema) return "—";
  if (schema.$ref) return schema.$ref.split("/").pop() ?? schema.$ref;
  if (schema.type === "array") return `array<${typeName(schema.items, document)}>`;
  if (schema.oneOf?.length) {
    return schema.oneOf.map((item) => typeName(item, document)).join(" | ");
  }
  if (schema.anyOf?.length) {
    return schema.anyOf.map((item) => typeName(item, document)).join(" | ");
  }
  if (schema.enum?.length) {
    return `enum(${schema.enum.map(String).join(" | ")})`;
  }
  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (types.length === 0) return "object";
  return schema.format
    ? `${types.join(" | ")}(${schema.format})`
    : types.join(" | ");
}

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

/** 请求体 schema 的属性表（解析 `$ref` 后展开）。 */
export function schemaFields(
  schema: OpenApiSchema | undefined,
  document: OpenApiDocument | null | undefined,
): SchemaField[] {
  const resolved = resolveSchema(schema, document);
  const required = new Set(resolved?.required ?? []);
  return Object.entries(resolved?.properties ?? {}).map(([name, property]) => ({
    name,
    type: typeName(property, document),
    required: required.has(name),
    description: property.description,
  }));
}

/** 请求体示例：优先用 spec 的 `example`，否则按属性的 `example` 拼一个。 */
export function requestBodyExample(
  operation: OpenApiOperation,
  document: OpenApiDocument | null | undefined,
): string | null {
  const media = operation.requestBody?.content?.["application/json"];
  if (!media) return null;
  if (media.example !== undefined) {
    return JSON.stringify(media.example, null, 2);
  }
  const schema = resolveSchema(media.schema, document);
  if (!schema?.properties) return null;
  const body: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    if (property.example !== undefined) {
      body[name] = property.example;
    }
  }
  return Object.keys(body).length > 0 ? JSON.stringify(body, null, 2) : null;
}

/** 文档级 / 操作级的鉴权：任一存在即视为需要令牌。 */
export function isSecured(
  operation: OpenApiOperation,
  document: OpenApiDocument | null | undefined,
): boolean {
  return (operation.security ?? document?.security ?? []).length > 0;
}

/** 一个接口的 curl 示例。路径参数写成 `<id>`，看得出是占位符。
 *
 * 令牌**永远**写成 `${WCR_TOKEN}`，不拼明文：示例要能随手复制安全。
 * 把真值拼进命令行会落到 shell history（`~/.zsh_history`）和 `ps` 输出里，
 * 而页面自己又要求「令牌别写进工单或截图」—— 两边口径不能打架。
 * 取值方式见页面提示（`read -rs WCR_TOKEN`）。
 */
export function curlForOperation({
  method,
  path,
  baseUrl,
  example,
}: {
  method: string;
  path: string;
  baseUrl: string;
  example?: string | null;
}): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const target = `${base || "https://<开放面地址>"}${path.replace(
    /\{([^}]+)\}/g,
    "<$1>",
  )}`;
  const lines = [`curl -s -X ${method.toUpperCase()} '${target}'`];
  lines.push('  -H "authorization: Bearer ${WCR_TOKEN}"');
  if (method.toLowerCase() === "post") {
    lines.push("  -H 'content-type: application/json'");
    lines.push("  -H 'idempotency-key: <uuid>'");
    if (example) lines.push(`  -d '${example}'`);
  }
  return lines.join(" \\\n");
}

/** 参数表里的一行（path / query / header 统一展示）。 */
export function parameterRows(
  operation: OpenApiOperation,
  document: OpenApiDocument | null | undefined,
): { parameter: OpenApiParameter; type: string }[] {
  return (operation.parameters ?? []).map((parameter) => ({
    parameter,
    type: typeName(parameter.schema, document),
  }));
}

/** 响应摘要：`202 说明 · 400 说明`。 */
export function responseSummary(operation: OpenApiOperation): string {
  return Object.entries(operation.responses ?? {})
    .map(([status, response]) => `${status} ${response.description ?? ""}`.trim())
    .join(" · ");
}
