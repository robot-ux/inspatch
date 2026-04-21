// Renders the Inspatch CLI startup banner: a 3-line block with a brand-color
// left accent bar. Uses single-cell glyphs only so alignment is stable across
// terminal fonts (the previous U+271B crosshair rendered wide in many fonts).
// Applies ANSI only on TTYs.

interface BannerInput {
  version: string;
  port: number;
  // Short one-line subtitle rendered under the endpoint (e.g. the home
  // boundary for auto-resolved projects).
  scope: string;
}

// U+258D LEFT VERTICAL BAR (narrow, single-cell). Reliable across fonts.
const BAR_GLYPH = "\u258D";
const BAR_FALLBACK = "|";

const ESC = "\u001b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
// Brand indigo bar. Prefer truecolor (exact #a3a6ff = ip-text-accent);
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
  const { version, port, scope } = input;
  const color = supportsColor();
  const b = color ? BOLD : "";
  const d = color ? DIM : "";
  const a = color ? (supportsTrueColor() ? ACCENT_TRUECOLOR : ACCENT_256) : "";
  const r = color ? RESET : "";
  const bar = color ? `${a}${BAR_GLYPH}${r}` : BAR_FALLBACK;

  const title = `${b}INSPATCH${r} ${d}v${version}${r}`;
  const endpoint = `${d}ws://127.0.0.1:${port}${r}`;
  const scopeLine = `${d}${scope}${r}`;

  const lines = [
    `${bar} ${title}`,
    `${bar} ${endpoint}`,
    `${bar} ${scopeLine}`,
    "",
  ];
  return lines.join("\n");
}

export function printBanner(input: BannerInput): void {
  process.stdout.write(renderBanner(input));
}
