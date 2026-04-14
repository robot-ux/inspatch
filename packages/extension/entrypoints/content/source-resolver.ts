import { SourceMapConsumer } from "source-map-js";

export interface SourceLocation {
  source: string;
  line: number;
  column: number;
}

const sourceMapCache = new Map<string, SourceMapConsumer | null>();

function isLocalUrl(url: string): boolean {
  return url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:");
}

function normalizePath(source: string): string {
  return source
    .replace(/^webpack:\/\/[^/]*\//, "")
    .replace(/^\.\/?/, "");
}

async function getOrFetchSourceMap(url: string): Promise<SourceMapConsumer | null> {
  if (sourceMapCache.has(url)) return sourceMapCache.get(url)!;
  if (!isLocalUrl(url)) {
    sourceMapCache.set(url, null);
    return null;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      sourceMapCache.set(url, null);
      return null;
    }
    const text = await res.text();

    const inlineMatch = text.match(
      /\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(.+)$/m,
    );
    if (inlineMatch) {
      const raw = JSON.parse(atob(inlineMatch[1]));
      const consumer = new SourceMapConsumer(raw);
      sourceMapCache.set(url, consumer);
      return consumer;
    }

    const externalMatch = text.match(
      /\/\/[#@]\s*sourceMappingURL=(.+\.map.*)$/m,
    );
    if (externalMatch) {
      const mapUrl = new URL(externalMatch[1].trim(), url).href;
      if (!isLocalUrl(mapUrl)) {
        sourceMapCache.set(url, null);
        return null;
      }
      const mapRes = await fetch(mapUrl);
      if (!mapRes.ok) {
        sourceMapCache.set(url, null);
        return null;
      }
      const raw = await mapRes.json();
      const consumer = new SourceMapConsumer(raw);
      sourceMapCache.set(url, consumer);
      return consumer;
    }

    sourceMapCache.set(url, null);
    return null;
  } catch {
    sourceMapCache.set(url, null);
    return null;
  }
}

export async function resolveSourceLocation(
  scriptUrl: string,
  line: number,
  column: number,
): Promise<SourceLocation | null> {
  const consumer = await getOrFetchSourceMap(scriptUrl);
  if (!consumer) return null;

  try {
    const pos = consumer.originalPositionFor({ line, column });
    if (!pos.source) return null;
    return {
      source: normalizePath(pos.source),
      line: pos.line!,
      column: pos.column!,
    };
  } catch {
    return null;
  }
}

export async function findComponentSource(
  componentName: string,
): Promise<SourceLocation | null> {
  const scripts = Array.from(document.querySelectorAll("script[src]"));
  const extensions = [".tsx", ".jsx", ".ts", ".js"];

  for (const script of scripts) {
    const src = (script as HTMLScriptElement).src;
    if (!isLocalUrl(src)) continue;

    const consumer = await getOrFetchSourceMap(src);
    if (!consumer) continue;

    const sources: string[] = (consumer as any).sources || [];
    const matchIdx = sources.findIndex((s: string) => {
      const basename = s.split("/").pop() || "";
      return extensions.some(ext => basename === `${componentName}${ext}`);
    });

    if (matchIdx === -1) continue;

    const matchingSource = sources[matchIdx];
    const contents: (string | null)[] = (consumer as any).sourcesContent || [];
    const content = contents[matchIdx];

    if (content) {
      const patterns = [
        `function ${componentName}`,
        `const ${componentName}`,
        `class ${componentName}`,
        `export default function ${componentName}`,
        `export function ${componentName}`,
      ];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (patterns.some(p => lines[i].includes(p))) {
          return { source: normalizePath(matchingSource), line: i + 1, column: 0 };
        }
      }
    }

    return { source: normalizePath(matchingSource), line: 1, column: 0 };
  }

  return null;
}

export function clearSourceMapCache(): void {
  sourceMapCache.clear();
}
