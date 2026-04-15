import { test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { openInEditor } from "../editor";

const PROJECT_DIR = "/home/user/myapp";

function makeUrl(params: Record<string, string>): URL {
  const u = new URL("http://localhost/open-in-editor");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

let spawnSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  spawnSpy = spyOn(Bun, "spawn").mockImplementation((() => ({
    stdout: new ReadableStream(),
    stderr: new ReadableStream({ start(c) { c.close(); } }),
    exitCode: 0,
    exited: Promise.resolve(0),
  })) as typeof Bun.spawn);
});

afterEach(() => {
  spawnSpy.mockRestore();
});

test("uses editor query param over configured editor", async () => {
  const url = makeUrl({ file: "/src/App.tsx", editor: "vscode" });
  const res = await openInEditor(url, PROJECT_DIR, "cursor");

  expect(res.status).toBe(200);
  const args = spawnSpy.mock.calls[0][0] as string[];
  expect(args[1]).toContain("vscode://file/src/App.tsx");
});

test("falls back to configured editor when no query param", async () => {
  const url = makeUrl({ file: "/src/App.tsx" });
  const res = await openInEditor(url, PROJECT_DIR, "cursor");

  expect(res.status).toBe(200);
  const args = spawnSpy.mock.calls[0][0] as string[];
  expect(args[1]).toContain("cursor://file/src/App.tsx");
});

test("falls back to configured editor when query param is invalid", async () => {
  const url = makeUrl({ file: "/src/App.tsx", editor: "sublime" });
  const res = await openInEditor(url, PROJECT_DIR, "vscode");

  expect(res.status).toBe(200);
  const args = spawnSpy.mock.calls[0][0] as string[];
  expect(args[1]).toContain("vscode://file/src/App.tsx");
});

test("includes line and column in URI", async () => {
  const url = makeUrl({ file: "/src/Button.tsx", editor: "cursor", line: "42", column: "7" });
  await openInEditor(url, PROJECT_DIR, "cursor");

  const args = spawnSpy.mock.calls[0][0] as string[];
  expect(args[1]).toBe("cursor://file/src/Button.tsx:42:7");
});

test("resolves relative path against projectDir", async () => {
  const url = makeUrl({ file: "src/App.tsx", editor: "cursor" });
  await openInEditor(url, PROJECT_DIR, "cursor");

  const args = spawnSpy.mock.calls[0][0] as string[];
  expect(args[1]).toContain(`cursor://file${PROJECT_DIR}/src/App.tsx`);
});

test("returns 400 when file param is missing", async () => {
  const url = makeUrl({ editor: "cursor" });
  const res = await openInEditor(url, PROJECT_DIR, "cursor");

  expect(res.status).toBe(400);
  expect(spawnSpy).not.toHaveBeenCalled();
});

test("returns 500 when opener exits with non-zero", async () => {
  spawnSpy.mockImplementation((() => ({
    stdout: new ReadableStream(),
    stderr: new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        c.enqueue(enc.encode("No application can open"));
        c.close();
      },
    }),
    exitCode: 1,
    exited: Promise.resolve(1),
  })) as typeof Bun.spawn);

  const url = makeUrl({ file: "/src/App.tsx", editor: "cursor" });
  const res = await openInEditor(url, PROJECT_DIR, "cursor");

  expect(res.status).toBe(500);
  const body = await res.json() as { error: string };
  expect(body.error).toContain("No application can open");
});
