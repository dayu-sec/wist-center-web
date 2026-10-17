import { useState, type FormEvent } from "react";
import { useGatewayUpgradeScript, useReleasesForComponents } from "../hooks";
import { buildUpgradeScriptRequest } from "../manualUpgrade";
import { CodeBlock } from "./CodeBlock";
import {
  MANUAL_GATEWAY_UPGRADE_COMPONENTS,
  manualUpgradeComponentLabel,
  normalizeReleaseVersion,
} from "./releaseComponents";
import { ErrorBanner, PrimaryButton, SectionCard, formatDateTime } from "./ui";
import styles from "./PlanForm.module.css";

/**
 * 网关详情页的「手动升级」：**生成一段在网关宿主上执行的升级脚本**。
 *
 * 刻意**不建计划、不下发任务** —— 与首次安装同一套「下载 / 校验 / 安装」逻辑，
 * 只是把版本钉在请求的那一个；运维复制脚本到网关宿主执行即可。
 *
 * 版本输入支持**手填命名**（如 `v0.12.0-alpha`），提交前统一去掉 `v` 前缀；
 * 同时用已发布版本做 datalist 提示，减少敲错。
 */
export function GatewayManualUpgradePanel({
  gatewayId,
  gatewayStatus,
}: {
  gatewayId: string;
  gatewayStatus?: string;
}) {
  const mutation = useGatewayUpgradeScript();
  const releases = useReleasesForComponents(MANUAL_GATEWAY_UPGRADE_COMPONENTS);
  const [component, setComponent] = useState<string>(
    MANUAL_GATEWAY_UPGRADE_COMPONENTS[0],
  );
  const [version, setVersion] = useState("");

  // 示例数据只是占位：不把它当真版本提示（版本仍可手填，真正的裁决在中心发布记录）。
  const exampleReleases = releases.source === "example";
  const versions = exampleReleases ? [] : (releases.versions[component] ?? []);
  const normalizedVersion = normalizeReleaseVersion(version);
  const canSubmit = !mutation.isPending && normalizedVersion.length > 0;
  // 列表非空却对不上：多半是手敲的版本不在已发布记录里 —— 提示，但不拦（发布记录可能刚更新）。
  // 两边都归一后比：发布记录可能带 `v`（包名 / 顶层目录名带 `v` 时原样保留）。
  const notPublished =
    versions.length > 0 &&
    normalizedVersion.length > 0 &&
    !versions.some(
      (value) => normalizeReleaseVersion(value) === normalizedVersion,
    );
  const result = mutation.data;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    mutation.mutate(
      buildUpgradeScriptRequest({ gatewayId, component, version }),
    );
  }

  return (
    <SectionCard
      title="手动升级"
      subtitle="选择组件与版本，生成一条 curl … | bash 命令，在网关宿主执行（与首次安装同一套下载 / 校验 / 安装逻辑）；不建计划、不下发任务。"
    >
      <form onSubmit={handleSubmit}>
        <div className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockTitle}>升级目标</span>
            <span className={styles.sectionNote}>
              版本可手填命名（如 v0.12.0-alpha），也可从已发布版本里选
            </span>
          </div>
          <div className={`${styles.targetRow} ${styles.targetRowTwo}`}>
            <select
              className={styles.input}
              value={component}
              onChange={(event) => {
                setComponent(event.target.value);
                setVersion("");
                mutation.reset();
              }}
            >
              {MANUAL_GATEWAY_UPGRADE_COMPONENTS.map((value) => (
                <option key={value} value={value}>
                  {manualUpgradeComponentLabel(value)}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              list="gateway-manual-upgrade-versions"
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                mutation.reset();
              }}
              placeholder={
                versions.length > 0
                  ? "选择或手填版本"
                  : "手填版本（该组件暂无已发布版本）"
              }
              required
            />
            <datalist id="gateway-manual-upgrade-versions">
              {versions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          {gatewayStatus === "offline" ? (
            <div className={styles.formError} role="status">
              该网关当前离线：脚本仍可生成，但请在它恢复后再执行（脚本不依赖中心推送）。
            </div>
          ) : null}

          {exampleReleases ? (
            <div className={styles.formError} role="alert">
              已发布版本暂时取不到（回落示例数据）；请手填真实版本，脚本仍以中心实际发布记录为准。
            </div>
          ) : null}

          {notPublished ? (
            <div className={styles.formNote} role="status">
              该版本不在当前已发布列表里；中心找不到制品时会拒绝生成脚本。
            </div>
          ) : null}

          <span className={styles.formNote}>
            {component === "wist-gwlinkd"
              ? "gwlinkd 脚本会下载指定版本、校验 sha256，覆盖宿主侧二进制并重启接入器；首次需宿主侧已是支持自更新的版本（≥0.12.0-alpha），否则仍可先用脚本换一次。"
              : "gateway-stack 脚本会下载指定版本、校验 sha256，再执行 gops prj upgrade（失败默认整体回滚）；升级会重建网关，状态短暂离线。"}
          </span>
        </div>

        <div className={styles.formAction}>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {mutation.isPending ? "生成中…" : "生成升级脚本"}
          </PrimaryButton>
        </div>
      </form>

      {mutation.error ? (
        <ErrorBanner>生成升级脚本失败：{String(mutation.error)}</ErrorBanner>
      ) : null}

      {result ? (
        <CodeBlock
          label={`在网关宿主上执行：${manualUpgradeComponentLabel(result.component)} ${result.version}`}
          code={result.command}
          hint={`命令在 ${formatDateTime(result.expiresAt)} 前有效；复制整行到网关宿主执行（需要 curl + bash）。`}
        />
      ) : null}
    </SectionCard>
  );
}
