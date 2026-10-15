import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAppTheme,
  initTheme,
  setAppTheme,
  toggleAppTheme,
  type AppTheme,
} from "../src/theme";

// 契约测试：主题（浅色 / 深色）—— 与 wist-gateway-web 同构（同一套 token 取值），
// 只有 storage key 是 Center 的。钉死三件事：
//   1. 两套 CSS token **一一对应**（漏一处 = 浅色下那块还是深色，要翻到那页才发现）；
//   2. 正文 / 语法 / 状态 / 三层主色在**两套主题**下都过 WCAG AA（4.5:1）；
//   3. 主题状态机：首次跟随系统、用户选过之后以用户选择为准、双向切换、落 `<html data-theme>`。
//
// Usage: npm run test:theme

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "src", "index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  assert(start >= 0, `index.css 里找不到 ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (index < css.length && depth > 0) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    index += 1;
  }
  return css.slice(open + 1, index - 1);
}

function tokens(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim());
  }
  return found;
}

// --- ① 两套 token 必须一一对应 ---
const darkAll = tokens(block(":root {"));
const lightBlock = block(':root[data-theme="light"]');
const light = tokens(lightBlock);

const NOT_COLOR = /^--(radius|font|sidebar-width|content-max|topbar-height)/;
const missing: string[] = [];
for (const [name, value] of darkAll) {
  if (NOT_COLOR.test(name)) continue;
  if (value.startsWith("var(")) continue; // 别名（--success 等）跟着被指向的 token 走
  if (!light.has(name)) missing.push(name);
}
assert(
  missing.length === 0,
  `浅色主题漏了这些 token（浅色下会露出深色）：${missing.join(", ")}`,
);
assert(
  lightBlock.includes("color-scheme: light"),
  "浅色主题要声明 color-scheme: light（否则原生下拉/滚动条仍是深色）",
);

// --- ② 对比度：两套主题的正文 / 语法 / 状态 / 层主色都要过 AA ---
function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [0, 2, 4].map((i) =>
    channel(parseInt(full.slice(i, i + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

function checkContrast(
  themeName: string,
  themeTokens: Map<string, string>,
  pairs: readonly [string, string, number][],
): void {
  for (const [foreground, background, minimum] of pairs) {
    const fg = themeTokens.get(foreground);
    const bg = themeTokens.get(background);
    if (!fg?.startsWith("#") || !bg?.startsWith("#")) continue;
    const value = contrast(fg, bg);
    assert(
      value >= minimum,
      `${themeName}：${foreground} 在 ${background} 上只有 ${value.toFixed(2)}:1，低于 ${minimum}:1`,
    );
  }
}

const TEXT_SURFACES: readonly [string, string, number][] = [
  ["--text", "--bg", AA_TEXT],
  ["--text", "--bg-elevated", AA_TEXT],
  ["--text-2", "--bg-elevated", AA_TEXT],
  ["--text-3", "--bg-elevated", AA_TEXT],
  ["--text-4", "--bg-elevated", AA_TEXT],
  ["--text-4", "--bg", AA_TEXT],
  ["--ok", "--bg-elevated", AA_TEXT],
  ["--warn", "--bg-elevated", AA_TEXT],
  ["--crit", "--bg-elevated", AA_TEXT],
  ["--info", "--bg-elevated", AA_TEXT],
  // 六色分类色板也当文字/数字用（图例、徽标、KPI），按正文标准查。
  ["--series-1", "--bg-elevated", AA_TEXT],
  ["--series-2", "--bg-elevated", AA_TEXT],
  ["--series-3", "--bg-elevated", AA_TEXT],
  ["--series-4", "--bg-elevated", AA_TEXT],
  ["--series-5", "--bg-elevated", AA_TEXT],
  ["--series-6", "--bg-elevated", AA_TEXT],
  ["--series-1", "--surface", AA_GRAPHIC],
];

checkContrast("深色主题", darkAll, TEXT_SURFACES);
checkContrast("浅色主题", light, TEXT_SURFACES);

// --- ③ 行为：跟随系统 → 用户选择优先 → 双向切换 ---
const store = new Map<string, string>();
let systemPrefersLight = true;
const dataset: Record<string, string> = {};

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
  matchMedia: (query: string) => ({
    matches: systemPrefersLight && query.includes("prefers-color-scheme: light"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};
(globalThis as unknown as { document: unknown }).document = {
  documentElement: { dataset },
  querySelector: () => null,
};

initTheme();
assert(getAppTheme() === "light", "首次进入应跟随系统偏好");
assert(dataset.theme === "light", '浅色要落到 <html data-theme="light"> 上');

setAppTheme("dark");
assert(getAppTheme() === "dark", "setAppTheme 立即生效");
assert(store.get("wistCenterWeb.theme") === "dark", "主题要写进 localStorage");
assert(dataset.theme === undefined, "深色是默认态：应删掉 data-theme 而不是写 dark");

setAppTheme("light");
assert(dataset.theme === "light", "setAppTheme 要改 <html>");
toggleAppTheme();
assert(getAppTheme() === "dark", "toggle 从浅色切到深色");
toggleAppTheme();
assert(getAppTheme() === "light", "toggle 再切回浅色");

systemPrefersLight = false;
assert(getAppTheme() === "light", "用户选过之后不再跟随系统");
const themes: AppTheme[] = ["light", "dark"];
for (const theme of themes) {
  setAppTheme(theme);
  assert(getAppTheme() === theme, `setAppTheme(${theme}) 要生效`);
}

console.log(
  "theme contract: OK (两套 token 对齐 / 对比度过 AA / 跟随系统 / 用户选择优先 / 双向切换 / color-scheme)",
);
