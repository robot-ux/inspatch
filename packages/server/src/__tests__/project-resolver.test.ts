import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeRequest } from "@inspatch/shared";
import { resolveProjectRoot } from "../project-resolver";

// Anchor tests under $HOME so the boundary check actually exercises. macOS's
// /var/folders tmpdir is outside $HOME, which would falsely trigger the
// "outside home" guard regardless of intent.
const HOME = realpathSync(homedir());
const TEST_ROOT = mkdtempSync(join(HOME, ".inspatch-resolver-test-"));

beforeAll(() => {
  // Project A: real package.json project
  mkdirSync(join(TEST_ROOT, "projA/src/deep"), { recursive: true });
  writeFileSync(join(TEST_ROOT, "projA/package.json"), "{}");

  // Project B: HTML file with no package.json anywhere up to $HOME
  mkdirSync(join(TEST_ROOT, "siteB"), { recursive: true });
  writeFileSync(join(TEST_ROOT, "siteB/index.html"), "<html></html>");

  // Symlink that would escape $HOME if followed without realpath
  mkdirSync(join(TEST_ROOT, "escape-src"), { recursive: true });
  writeFileSync(join(TEST_ROOT, "escape-src/file.tsx"), "");
  symlinkSync("/etc", join(TEST_ROOT, "link-to-etc"));
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

const TEST_CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function localhostReq(sourceFile?: string): ChangeRequest {
  return {
    type: "change_request",
    conversationId: TEST_CONVERSATION_ID,
    description: "x",
    elementXpath: "/",
    pageSource: "localhost",
    mode: "quick",
    sourceFile,
  };
}

function fileReq(filePath?: string): ChangeRequest {
  return {
    type: "change_request",
    conversationId: TEST_CONVERSATION_ID,
    description: "x",
    elementXpath: "/",
    pageSource: "file",
    mode: "quick",
    filePath,
  };
}

test("localhost: walks up to the nearest package.json", () => {
  const source = join(TEST_ROOT, "projA/src/deep/Foo.tsx");
  writeFileSync(source, "");
  const res = resolveProjectRoot(localhostReq(source));
  expect(res).toEqual({ root: join(TEST_ROOT, "projA") });
});

test("localhost: package.json at the anchor directory itself", () => {
  const source = join(TEST_ROOT, "projA/package.json");
  const res = resolveProjectRoot(localhostReq(source));
  expect(res).toEqual({ root: join(TEST_ROOT, "projA") });
});

test("localhost: no package.json between anchor and $HOME is rejected", () => {
  const source = join(TEST_ROOT, "siteB/script.js");
  writeFileSync(source, "");
  const res = resolveProjectRoot(localhostReq(source));
  expect("error" in res && res.error).toMatch(/No package\.json found/);
});

test("file://: falls back to HTML parent when no package.json", () => {
  const res = resolveProjectRoot(fileReq(join(TEST_ROOT, "siteB/index.html")));
  expect(res).toEqual({ root: join(TEST_ROOT, "siteB") });
});

test("file://: still prefers package.json project when present", () => {
  const html = join(TEST_ROOT, "projA/page.html");
  writeFileSync(html, "<html></html>");
  const res = resolveProjectRoot(fileReq(html));
  expect(res).toEqual({ root: join(TEST_ROOT, "projA") });
});

test("rejects requests with no source path", () => {
  const res = resolveProjectRoot(localhostReq(undefined));
  expect("error" in res && res.error).toMatch(/No source path/);
});

test("rejects non-absolute sourceFile (URL-style webpack path)", () => {
  const res = resolveProjectRoot(localhostReq("webpack:///./src/Foo.tsx"));
  expect("error" in res && res.error).toMatch(/absolute source paths/);
});

test("rejects http:// sourceFile", () => {
  const res = resolveProjectRoot(localhostReq("http://localhost:5173/src/Foo.tsx"));
  expect("error" in res && res.error).toMatch(/absolute source paths/);
});

test("rejects sourceFile that does not exist on disk", () => {
  const res = resolveProjectRoot(localhostReq("/definitely/not/a/real/path/Foo.tsx"));
  expect("error" in res && res.error).toMatch(/does not exist on disk/);
});

test("rejects paths outside $HOME", () => {
  const res = resolveProjectRoot(localhostReq("/etc/hosts"));
  expect("error" in res && res.error).toMatch(/outside your home directory/);
});

test("symlink escape to /etc is blocked via realpath", () => {
  const source = join(TEST_ROOT, "link-to-etc/hosts");
  const res = resolveProjectRoot(localhostReq(source));
  expect("error" in res && res.error).toMatch(/outside your home directory/);
});
