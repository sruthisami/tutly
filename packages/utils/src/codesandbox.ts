export const CODESANDBOX_URL_EXAMPLE =
  "https://codesandbox.io/p/sandbox/my-project-a1b2c3";

// Copied sandbox URLs always carry query strings and extra path segments, so
// only the leading segments are matched.
const CODESANDBOX_PATH_PATTERNS = [
  /^\/p\/(?:sandbox|devbox)\/[\w.-]+/,
  /^\/p\/github\/[\w.-]+\/[\w.-]+\/[^/]+/,
  /^\/s\/[\w.-]+/,
  /^\/embed\/[\w.-]+/,
  /^\/devbox\/[\w.-]+/,
];

export function isCodeSandboxHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "codesandbox.io" ||
    host.endsWith(".codesandbox.io") ||
    host.endsWith(".csb.app")
  );
}

export function isValidCodeSandboxUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (!isCodeSandboxHost(host)) return false;

  // Preview hosts (*.csb.app, <id>.codesandbox.io) carry the sandbox id in the
  // subdomain, so their paths are unconstrained.
  if (host !== "codesandbox.io" && host !== "www.codesandbox.io") return true;

  return CODESANDBOX_PATH_PATTERNS.some((pattern) =>
    pattern.test(parsed.pathname),
  );
}
