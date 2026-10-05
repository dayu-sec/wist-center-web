import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCreateGatewayInstance } from "../hooks";
import {
  ErrorBanner,
  FormField,
  PrimaryButton,
  ReceiptCard,
  TextInput,
  formatDateTime,
  lifecycleLabel,
} from "./ui";
import styles from "./GatewayInstanceCreatePanel.module.css";

/**
 * 提供可按需展开的实例创建流程。
 *
 * 设计（`gateway-secure-registration.md` §8）：**创建不交付接入凭据** —— 创建只建实例；
 * 一次性、短命的接入券由「连接 Gateway」页的「生成/轮换」动作产出、页面一次性展示。
 */
export function GatewayInstanceCreatePanel() {
  const [expanded, setExpanded] = useState(false);
  const mutation = useCreateGatewayInstance();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      gatewayName: String(data.get("gatewayName") ?? ""),
      requestedBy: String(data.get("requestedBy") ?? ""),
    });
  }

  const instance = mutation.data?.data.instance;

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>新增网关实例</h2>
          <p className={styles.subtitle}>
            创建待接入实例；接入凭据在「连接 Gateway」页单独生成（一次性、短命）。
          </p>
        </div>
        <button
          type="button"
          className={styles.toggleButton}
          aria-expanded={expanded}
          aria-controls="gateway-instance-create-content"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起创建" : "+ 创建实例"}
        </button>
      </header>

      {expanded ? (
        <div id="gateway-instance-create-content" className={styles.body}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formFields}>
              <FormField label="网关名称" hint="例如：gw-prod-east">
                <TextInput
                  name="gatewayName"
                  required
                  placeholder="请输入网关名称"
                />
              </FormField>
              <FormField label="申请者（requested_by）">
                <TextInput name="requestedBy" defaultValue="admin" required />
              </FormField>
            </div>
            <div className={styles.formAction}>
              <span className={styles.actionHint}>
                创建后实例进入“待接入”状态；接入凭据由「连接 Gateway」页生成。
              </span>
              <PrimaryButton type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "创建中…" : "创建实例"}
              </PrimaryButton>
            </div>
          </form>

          {mutation.error ? (
            <ErrorBanner>创建失败：{String(mutation.error)}</ErrorBanner>
          ) : null}
          {instance ? (
            <>
              <ReceiptCard
                title="创建回执"
                fields={[
                  ["网关 ID", instance.gatewayId],
                  ["实例 ID", instance.instanceId],
                  ["生命周期", lifecycleLabel(instance.lifecycleState)],
                  ["创建时间", formatDateTime(instance.createdAt)],
                ]}
              />
              <p className={styles.installHint}>
                {`实例已创建（待接入）。接入券`}
                <strong>不在创建回执里</strong>
                {`：请到`}
                <Link to={`/instance/${instance.gatewayId}`}>
                  「连接 Gateway」
                </Link>
                {`生成一次性接入券（短命、刷新即丢），再交给宿主侧 wist-gwlinkd 接入。`}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
