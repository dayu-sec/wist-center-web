import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchOpenApiStatus,
  type OpenApiDocument,
  type OpenApiInterface,
  type OpenApiOperation,
  type OpenApiStatus,
} from "../api";
import {
  Badge,
  ErrorBanner,
  LoadingDots,
  PageShell,
  SectionCard,
  formatRelativeTime,
  type BadgeTone,
} from "./ui";
import {
  curlForOperation,
  isSecured,
  operationsOf,
  parameterRows,
  requestBodyExample,
  responseSummary,
  schemaFields,
} from "./openApiHealth";
import styles from "./OpenApiAvailabilityPage.module.css";

/**
 * 开放面（第三方调查 API）的「接口可用性」页。
 *
 * - **探活**由后端自己做（中心回环打开放面），页面只展示结果；
 * - **接口清单**来自后端 spec（`GET /api/v1/admin/open-api`），页面不维护第二份路径 / 参数；
 * - curl 示例的基地址默认取 `open_public_url`；令牌**不经过浏览器**（示例统一用
 *   `${WCR_TOKEN}`，调用方自己 `read -rs` 灌进去）。
 *
 * 注意路径不能叫 `/api-health`：dev / 生产都把 `/api` 前缀反代给中心，页面会被吞成 404。
 */
const BASE_URL_KEY = "warpInsightCenterOpenApiBase";
const REFRESH_MS = 30_000;

type Section = "probes" | "api";

function readBaseUrl(): string {
  try {
    return window.localStorage.getItem(BASE_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

function probeTone(probe: OpenApiInterface): BadgeTone {
  if (probe.status === "ok") return "green";
  if (probe.status === "not_configured") return "gray";
  return "red";
}

function probeLabel(probe: OpenApiInterface): string {
  if (probe.status === "ok") return "可用";
  if (probe.status === "not_configured") return "未启用";
  return "不可用";
}

export function OpenApiAvailabilityPage() {
  const [data, setData] = useState<OpenApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("probes");
  const [baseUrl, setBaseUrl] = useState(readBaseUrl);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  // 只在「打开页面之后」统计：这里不是长期趋势，是现场自查。
  const [samples, setSamples] = useState<{ total: number; ok: number }>({
    total: 0,
    ok: 0,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchOpenApiStatus();
      if (!mounted.current) return;
      setData(next);
      setError(null);
      setCheckedAt(Date.now());
      const probes = next.interfaces;
      setSamples((previous) => ({
        total: previous.total + probes.length,
        ok: previous.ok + probes.filter((probe) => probe.status === "ok").length,
      }));
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const document: OpenApiDocument | null = data?.openapi ?? null;
  const operations = useMemo(() => operationsOf(document), [document]);
  const effectiveBase = baseUrl.trim() || data?.base_url || "";

  function updateBaseUrl(value: string) {
    setBaseUrl(value);
    try {
      window.localStorage.setItem(BASE_URL_KEY, value);
    } catch {
      // 存不下就只在本页生效。
    }
  }

  const okProbes = data?.interfaces.filter((probe) => probe.status === "ok").length ?? 0;
  const probeCount = data?.interfaces.length ?? 0;
  const availability =
    samples.total === 0 ? null : Math.round((samples.ok / samples.total) * 100);

  return (
    <PageShell
      title="接口可用性"
      summary="第三方调查 API 的现场自查：开放面 listener 与调查路由是否真的可用，以及当前版本的接口清单与 curl 示例。"
    >
      <div className={styles.tabs} role="tablist" aria-label="接口可用性视图">
        <button
          type="button"
          role="tab"
          aria-selected={section === "probes"}
          className={`${styles.tab} ${section === "probes" ? styles.tabActive : ""}`}
          onClick={() => setSection("probes")}
        >
          <span className={styles.tabLabel}>接口状态</span>
          <span className={styles.tabHint}>
            {data
              ? `${okProbes}/${probeCount} 项正常`
              : loading
                ? "读取中…"
                : "暂无结果"}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "api"}
          className={`${styles.tab} ${section === "api" ? styles.tabActive : ""}`}
          onClick={() => setSection("api")}
        >
          <span className={styles.tabLabel}>接口定义</span>
          <span className={styles.tabHint}>
            {operations.length > 0 ? `${operations.length} 个接口 · 中心输出` : "暂无清单"}
          </span>
        </button>
      </div>

      {error ? (
        <ErrorBanner>
          读取开放面状态失败：{error}
          <button type="button" className={styles.linkButton} onClick={() => void load()}>
            重试
          </button>
        </ErrorBanner>
      ) : null}

      {loading && !data ? (
        <SectionCard title="接口状态">
          <LoadingDots />
        </SectionCard>
      ) : null}

      {section === "probes" && data ? (
        <ProbeSection
          data={data}
          availability={availability}
          checkedAt={checkedAt}
          onRefresh={() => void load()}
        />
      ) : null}

      {section === "api" ? (
        <SectionCard
          title="接口定义"
          subtitle={
            document
              ? `接口清单由中心自己输出（OpenAPI ${document.openapi}，v${document.info.version}）：路径与参数跟着代码走，页面不维护第二份。`
              : "接口清单来自后端 GET /api/v1/admin/open-api；拿不到时先看「接口状态」。"
          }
        >
          <div className={styles.toolbar}>
            <Badge tone={operations.length > 0 ? "blue" : "gray"}>
              {operations.length > 0 ? `${operations.length} 个接口` : "无清单"}
            </Badge>
            <button type="button" className={styles.button} onClick={() => void load()}>
              重新读取
            </button>
          </div>

          <div className={styles.baseRow}>
            <label className={styles.baseField}>
              <span className={styles.label}>调用基地址（curl 示例用）</span>
              <input
                className={styles.input}
                value={baseUrl}
                placeholder={data?.base_url ?? "https://<开放面地址>"}
                onChange={(event) => updateBaseUrl(event.target.value)}
              />
            </label>
            {data ? (
              <span className={styles.configLine}>
                角色 <code className={styles.mono}>{data.required_role}</code>
                <span className={styles.dot}>·</span>
                凭据服务 {data.credentials_enabled ? "已启用" : "未启用"}
              </span>
            ) : null}
          </div>

          {operations.length > 0 && document ? (
            <div className={styles.apiList}>
              {operations.map(({ path, method, operation }) => (
                <OperationCard
                  key={`${method}:${path}`}
                  path={path}
                  method={method}
                  operation={operation}
                  document={document}
                  baseUrl={effectiveBase}
                />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>这个中心版本还没有输出开放面接口清单。</p>
          )}

          <p className={styles.note}>
            令牌由 <code className={styles.mono}>wist-cred</code> 为第三方签发
            （<code className={styles.mono}>audience = wist-center</code>、
            <code className={styles.mono}>roles = investigation:run</code>，
            <code className={styles.mono}>resources.agents</code> 限定可调查的机器）。
            它<b>不经过本页面</b>：示例统一写成{" "}
            <code className={styles.mono}>{'"authorization: Bearer ${WCR_TOKEN}"'}</code>，
            在自己的终端里先灌进去再跑：
          </p>

          <pre className={styles.code}>
            {"read -rs WCR_TOKEN && export WCR_TOKEN   # 不回显，也不进 shell history"}
          </pre>

          <p className={styles.note}>
            不要直接把令牌拼进命令行：那会留在 <code className={styles.mono}>~/.zsh_history</code> 里，
            运行期间也会出现在 <code className={styles.mono}>ps</code> 输出中。也不要把令牌写进工单或截图。
          </p>

          <p className={styles.note}>
            报告正文不在中心：调查成功后按返回的{" "}
            <code className={styles.mono}>evidence.cmd_id</code> 去{" "}
            <code className={styles.mono}>wist-field</code> 取。
          </p>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}

function ProbeSection({
  data,
  availability,
  checkedAt,
  onRefresh,
}: {
  data: OpenApiStatus;
  availability: number | null;
  checkedAt: number | null;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      title="接口状态"
      subtitle="探活由中心自己回环发起（外部系统可能连不到开放面，中心一定连得到本机 listener）；每 30 秒自动复查。"
    >
      <div className={styles.summaryRow}>
        <Badge tone={data.enabled ? "green" : "gray"}>
          {data.enabled ? "开放面已启用" : "开放面未启用"}
        </Badge>
        {data.listen_addr ? (
          <span className={styles.summaryItem}>
            监听 <code className={styles.mono}>{data.listen_addr}</code>
          </span>
        ) : null}
        {data.base_url ? (
          <span className={styles.summaryItem}>
            对外地址 <code className={styles.mono}>{data.base_url}</code>
          </span>
        ) : null}
        <span className={styles.summaryItem}>
          本次会话可用率{" "}
          <strong>{availability === null ? "—" : `${availability}%`}</strong>
        </span>
        <span className={styles.summaryItem}>
          最近检查{" "}
          {checkedAt ? formatRelativeTime(new Date(checkedAt)) : "—"}
          <button type="button" className={styles.linkButton} onClick={onRefresh}>
            立即复查
          </button>
        </span>
      </div>

      {data.interfaces.length === 0 ? (
        <p className={styles.empty}>
          开放面未配置（<code className={styles.mono}>server.open_addr</code> 为空）：
          这一版没有可探活的目标。配好并重启中心后这里会出现 listener 与调查路由两项。
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>检查</th>
                <th>覆盖</th>
                <th>状态</th>
                <th>延迟</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {data.interfaces.map((probe) => (
                <tr key={probe.id}>
                  <td>
                    <div className={styles.probeLabel}>{probe.label}</div>
                    <div className={styles.probeUrl}>{probe.url}</div>
                  </td>
                  <td className={styles.meta}>{probe.covers ?? "—"}</td>
                  <td>
                    <Badge tone={probeTone(probe)}>{probeLabel(probe)}</Badge>
                  </td>
                  <td className={styles.meta}>
                    {probe.latency_ms === undefined ? "—" : `${probe.latency_ms} ms`}
                  </td>
                  <td className={styles.meta}>{probe.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function OperationCard({
  path,
  method,
  operation,
  document,
  baseUrl,
}: {
  path: string;
  method: string;
  operation: OpenApiOperation;
  document: OpenApiDocument;
  baseUrl: string;
}) {
  const parameters = parameterRows(operation, document);
  const media = operation.requestBody?.content?.["application/json"];
  const fields = media ? schemaFields(media.schema, document) : [];
  const example = requestBodyExample(operation, document);
  const secured = isSecured(operation, document);
  const curl = curlForOperation({ method, path, baseUrl, example });

  return (
    <details className={styles.operation}>
      <summary className={styles.summary}>
        <span className={styles.method}>{method.toUpperCase()}</span>
        <code className={styles.path}>{path}</code>
        {operation.summary ? <span className={styles.opSummary}>{operation.summary}</span> : null}
        {secured ? <span className={styles.lock}>需要令牌</span> : null}
      </summary>
      <div className={styles.operationBody}>
        <div>
          <div className={styles.label}>调用示例</div>
          <pre className={styles.code}>{curl}</pre>
        </div>

        {parameters.length > 0 ? (
          <div>
            <div className={styles.label}>参数</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>参数</th>
                    <th>位置</th>
                    <th>类型</th>
                    <th>必填</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map(({ parameter, type }) => (
                    <tr key={`${parameter.in}:${parameter.name}`}>
                      <td>
                        <code className={styles.mono}>{parameter.name}</code>
                      </td>
                      <td>{parameter.in}</td>
                      <td>{type}</td>
                      <td>{parameter.required ? "是" : "否"}</td>
                      <td className={styles.meta}>{parameter.description ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {fields.length > 0 ? (
          <div>
            <div className={styles.label}>请求体</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>字段</th>
                    <th>类型</th>
                    <th>必填</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.name}>
                      <td>
                        <code className={styles.mono}>{field.name}</code>
                      </td>
                      <td>{field.type}</td>
                      <td>{field.required ? "是" : "否"}</td>
                      <td className={styles.meta}>{field.description ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className={styles.meta}>响应：{responseSummary(operation) || "—"}</div>
      </div>
    </details>
  );
}
