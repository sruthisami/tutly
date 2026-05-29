import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "./env.js";

type SandpackFile =
  | string
  | {
      code?: string;
      hidden?: boolean;
      active?: boolean;
      readOnly?: boolean;
    };

type SandpackTemplate = {
  files?: Record<string, SandpackFile>;
  template?: string;
  options?: Record<string, unknown>;
};

function decodeTemplate(
  base64: string | null | undefined,
): SandpackTemplate | null {
  if (!base64) return null;
  try {
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(decoded) as SandpackTemplate;
  } catch {
    return null;
  }
}

function fileContent(entry: SandpackFile): string {
  if (typeof entry === "string") return entry;
  return entry.code ?? "";
}

function normalizePath(p: string): string {
  return p.startsWith("/") ? p.slice(1) : p;
}

// Join an untrusted relative path under a trusted base, rejecting traversal.
function safeJoin(base: string, rel: string): string {
  if (rel.includes("\0")) {
    throw new Error("invalid path: null byte");
  }
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(resolvedBase, rel);
  if (
    resolved !== resolvedBase &&
    !resolved.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(`path escapes workspace: ${rel}`);
  }
  return resolved;
}

const TEST_FILE_REGEX = /\.(test|spec)\.[tj]sx?$/;

export type AssembledWorkspace = {
  cwd: string;
  visibleTestPaths: string[];
  hiddenTestPaths: string[];
};

export async function assembleWorkspace(opts: {
  testRunId: string;
  submissionData: unknown;
  sandboxTemplate: string | null;
  hiddenTestFiles: Record<string, string> | null;
}): Promise<AssembledWorkspace> {
  const runId = path.basename(opts.testRunId).replace(/[^a-zA-Z0-9_-]/g, "");
  const cwd = path.resolve(env.WORK_DIR, `run-${runId}-${Date.now()}`);
  await mkdir(cwd, { recursive: true });
  await chmod(cwd, 0o777);

  const template = decodeTemplate(opts.sandboxTemplate);
  const templateFiles = template?.files ?? {};
  const submissionFiles =
    opts.submissionData && typeof opts.submissionData === "object"
      ? (opts.submissionData as Record<string, SandpackFile>)
      : {};

  const visibleTestPaths: string[] = [];
  const hiddenTestPaths: string[] = [];

  // Order: template → student overlay → re-apply visible tests (anti-tamper) → hidden tests.
  const merged: Record<string, string> = {};

  const setMerged = (filePath: string, content: string): string | null => {
    let safePath: string;
    try {
      safePath = sandpackPath(filePath);
    } catch {
      return null;
    }
    merged[safePath] = content;
    return safePath;
  };

  for (const [filePath, entry] of Object.entries(templateFiles)) {
    if (typeof entry === "object" && entry.hidden === true) continue;
    setMerged(filePath, fileContent(entry));
  }

  for (const [filePath, entry] of Object.entries(submissionFiles)) {
    setMerged(filePath, fileContent(entry));
  }

  for (const [filePath, entry] of Object.entries(templateFiles)) {
    if (!TEST_FILE_REGEX.test(filePath)) continue;
    if (typeof entry === "object" && entry.hidden === true) continue;
    const written = setMerged(filePath, fileContent(entry));
    if (written) visibleTestPaths.push(normalizePath(filePath));
  }

  const hidden = opts.hiddenTestFiles ?? {};
  for (const [filePath, source] of Object.entries(hidden)) {
    const normalized = normalizePath(filePath);
    const safePath = normalized.startsWith("__hidden__/")
      ? `/${normalized}`
      : `/__hidden__/${normalized}`;
    merged[safePath] = source;
    hiddenTestPaths.push(safePath.slice(1));
  }

  for (const [sandpackKey, content] of Object.entries(merged)) {
    const onDisk = safeJoin(cwd, sandpackKey.slice(1));
    await mkdir(path.dirname(onDisk), { recursive: true });
    await writeFile(onDisk, content, "utf-8");
  }

  const manifest = {
    template: template?.template ?? "vanilla",
    options: template?.options ?? undefined,
    files: Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, { code: v }]),
    ),
  };
  await writeFile(
    safeJoin(cwd, "manifest.json"),
    JSON.stringify(manifest),
    "utf-8",
  );

  return { cwd, visibleTestPaths, hiddenTestPaths };
}

function sandpackPath(filePath: string): string {
  const norm = normalizePath(filePath);
  // Reject traversal — sandpack accepts /-prefixed paths.
  if (norm.includes("\0") || norm.split("/").some((seg) => seg === "..")) {
    throw new Error(`invalid path: ${filePath}`);
  }
  return `/${norm}`;
}

export async function cleanupWorkspace(cwd: string): Promise<void> {
  await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
}
