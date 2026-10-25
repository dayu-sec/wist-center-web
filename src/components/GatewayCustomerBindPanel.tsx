import type { FormEvent } from "react";
import { useBindGatewayCustomer, useGatewayBindingHistory } from "../hooks";
import {
  ErrorBanner,
  FormField,
  FormStack,
  LoadingDots,
  PrimaryButton,
  ReceiptCard,
  SectionCard,
  TextInput,
  bindingStatusLabel,
  formatDateTime,
} from "./ui";
import styles from "./GatewayCustomerBindPanel.module.css";

/** 详情页已有的**当前**绑定事实（来自实例列表视图，10s 轮询）。 */
export interface CurrentBinding {
  customerId?: string | null;
  status?: string | null;
  revision?: number | null;
  appliedRevision?: number | null;
  appliedAt?: string | null;
  lastError?: string | null;
  reportedTenantId?: string | null;
}

/** 绑定客户到网关实例；详情页传入 gatewayId 时只允许编辑客户信息。 */
export function GatewayCustomerBindPanel({
  gatewayId,
  current,
}: {
  gatewayId?: string;
  /** 当前绑定（详情页从实例视图带给；不传就只显示表单与回执）。 */
  current?: CurrentBinding;
}) {
  const mutation = useBindGatewayCustomer();
  const currentGatewayId = gatewayId?.trim() ?? "";
  // 换绑审计：只有详情页（已知 gatewayId）能查；10s 轮询随实例列表一起刷新。
  const history = useGatewayBindingHistory(currentGatewayId);
  const events = [...(history.data?.data ?? [])].reverse();
  // 旧中心没有这个路由：`fetchOrFallback` 回落成示例数据（空数组）—— 要说清是「不支持」，
  // 不能让人以为「从来没绑过」。
  const historyUnsupported = history.data?.source === "example";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      gatewayId: currentGatewayId || String(data.get("gatewayId") ?? ""),
      customerId: String(data.get("customerId") ?? ""),
      // 绑定接口仍要求 requested_by；当前管理端没有独立用户字段，沿用默认管理身份。
      requestedBy: "admin",
    });
  }

  const binding = mutation.data;
  // 「当前绑定」只读卡片：版本 / 生效时间 / 失败原因（设计 §7.6 要求看得见）。
  const currentFields: [string, string][] = [];
  if (current?.customerId) {
    currentFields.push(
      ["客户 ID", current.customerId],
      ["状态", bindingStatusLabel(current.status)],
      ["绑定版本", current.revision ? String(current.revision) : "—"],
      [
        "生效版本",
        current.appliedRevision === null || current.appliedRevision === undefined
          ? "未生效"
          : String(current.appliedRevision),
      ],
      [
        "最近生效时间",
        current.appliedAt ? formatDateTime(current.appliedAt) : "—",
      ],
      ["最近错误", current.lastError ?? "—"],
    );
    if (current.reportedTenantId) {
      currentFields.push(["网关自报 tenant_id", current.reportedTenantId]);
    }
  }

  return (
    <SectionCard
      title="绑定客户"
      subtitle="为 GateWay 管理实例绑定客户 ID，建立实例与客户的归属关系；绑定后由中心下发到网关数据面（tenant_id）。不支持解绑，换绑会递增绑定版本并触发数据面重新加载。"
    >
      {currentFields.length > 0 ? (
        <ReceiptCard title="当前绑定" fields={currentFields} />
      ) : null}
      <form onSubmit={handleSubmit}>
        <FormStack
          actions={
            <PrimaryButton type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "绑定中…" : "绑定客户"}
            </PrimaryButton>
          }
        >
          {!currentGatewayId ? (
            <FormField label="网关 ID" hint="例如：gw-001">
              <TextInput
                name="gatewayId"
                required
                placeholder="请输入网关 ID"
              />
            </FormField>
          ) : null}
          <FormField label="客户 ID" hint="例如：cust-acme">
            <TextInput name="customerId" required placeholder="请输入客户 ID" />
          </FormField>
        </FormStack>
      </form>
      {mutation.error ? (
        <ErrorBanner>绑定失败：{String(mutation.error)}</ErrorBanner>
      ) : null}
      {binding ? (
        <ReceiptCard
          title="绑定回执"
          fields={[
            ["网关 ID", binding.gatewayId],
            ["客户 ID", binding.customerId],
            ["状态", bindingStatusLabel(binding.status)],
            ["绑定版本", String(binding.revision)],
            [
              "生效版本",
              binding.appliedRevision === null
                ? "未生效"
                : String(binding.appliedRevision),
            ],
            [
              "生效时间",
              binding.appliedAt ? formatDateTime(binding.appliedAt) : "—",
            ],
            ["最近错误", binding.lastError ?? "—"],
            ["绑定时间", formatDateTime(binding.boundAt)],
          ]}
        />
      ) : null}
      {currentGatewayId ? (
        <div className={styles.history}>
          <div className={styles.historyTitle}>换绑审计</div>
          <div className={styles.historyHint}>
            绑定表只保留最新值；这里按时间倒序展示“谁在什么时候把该网关绑到哪个客户”。
            同一客户的重复绑定不改变归属，不单独记录。
          </div>
          {history.isLoading ? <LoadingDots /> : null}
          {history.error ? (
            <ErrorBanner>
              换绑审计加载失败：{String(history.error)}
            </ErrorBanner>
          ) : null}
          {historyUnsupported ? (
            <p className={styles.historyEmpty}>
              中心版本较旧，暂不支持换绑审计（接口未提供）。
            </p>
          ) : null}
          {!history.isLoading &&
          !history.error &&
          !historyUnsupported &&
          events.length === 0 ? (
            <p className={styles.historyEmpty}>暂无绑定记录。</p>
          ) : null}
          {events.length > 0 ? (
            <ul className={styles.eventList}>
              {events.map((event) => (
                <li
                  key={`${event.at}-${event.revision}-${event.customerId}`}
                  className={styles.event}
                >
                  <span className={styles.customer}>{event.customerId}</span>
                  {event.previousCustomerId ? (
                    <span className={styles.previous}>
                      ← 换绑自 {event.previousCustomerId}
                    </span>
                  ) : (
                    <span className={styles.previous}>首次绑定</span>
                  )}
                  <span className={styles.previous}>
                    v{event.revision} · {event.requestedBy || "未知操作者"}
                  </span>
                  <span className={styles.meta}>{formatDateTime(event.at)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
