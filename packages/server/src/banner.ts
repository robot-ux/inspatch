// Renders the Inspatch CLI startup banner: a 3-line bracket-scope mark
// (four corner brackets + center crosshair) next to the wordmark and
// run-context subtitle. Uses ANSI on TTYs only.

interface BannerInput {
  version: string;
  port: number;
  projectDir: string;
  editor: string;
}

const MARK_TOP = "\u250F\u2501  \u2501\u2513"; // ┏━  ━┓
const MARK_MID = "   \u271B   "; //    ✛
const MARK_BOT = "\u2517\u2501  \u2501\u251B"; // ┗━  ━┛

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
// Brand indigo cross. Prefer truecolor (exact #a3a6ff = ip-text-accent);
// fall back to 256-color index 147 (#afafff) on less capable terminals.
const ACCENT_TRUECOLOR = `${ESC}38;2;163;166;255m`;
const ACCENT_256 = `${ESC}38;5;147m`;

function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

function supportsTrueColor(): boolean {
  const ct = process.env.COLORTERM;
  return ct === "truecolor" || ct === "24bit";
}

export function renderBanner(input: BannerInput): string {
  const { version, port, projectDir, editor } = input;
  const color = supportsColor();
  const b = color ? BOLD : "";
  const d = color ? DIM : "";
  const a = color ? (supportsTrueColor() ? ACCENT_TRUECOLOR : ACCENT_256) : "";
  const r = color ? RESET : "";

  const wordmark = `${b}INSPATCH${r}  ${d}v${version}${r}`;
  const endpoint = `${d}ws://127.0.0.1:${port}${r}  ${d}\u00B7${r}  ${d}${editor}${r}`;
  const project = `${d}${projectDir}${r}`;

  const l1 = `${b}${MARK_TOP}${r}`;
  const l2 = color
    ? `${b}   ${a}\u271B${r}${b}   ${r}  ${wordmark}`
    : `${MARK_MID}  INSPATCH  v${version}`;
  const l3 = `${b}${MARK_BOT}${r}     ${endpoint}`;
  const l4 = `          ${project}`;

  return [l1, l2, l3, l4, ""].join("\n");
}

export function printBanner(input: BannerInput): void {
  process.stdout.write(renderBanner(input));
}
