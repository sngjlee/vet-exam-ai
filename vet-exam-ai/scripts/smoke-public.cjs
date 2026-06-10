#!/usr/bin/env node

const DEFAULT_BASE_URL =
  process.env.SMOKE_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://127.0.0.1:3000";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: 10_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--base-url") {
      args.baseUrl = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  console.log(`Usage:
  npm run smoke:public -- --base-url https://example.com
  SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:public

Options:
  --base-url <url>     Target app URL. Defaults to SMOKE_BASE_URL, NEXT_PUBLIC_SITE_URL, or http://127.0.0.1:3000.
  --timeout-ms <ms>    Per-request timeout. Defaults to 10000.
`);
}

function normalizeBaseUrl(value) {
  if (!value) throw new Error("Missing base URL");
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function targetUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function isRedirectTo(response, expectedPrefix) {
  const location = response.headers.get("location");
  if (!location) return false;

  let pathname = location;
  try {
    pathname = new URL(location, response.url).pathname;
  } catch {
    pathname = location.split("?")[0] || location;
  }

  return response.status >= 300 && response.status < 400 && pathname.startsWith(expectedPrefix);
}

function hasHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

function hasJson(response) {
  return (response.headers.get("content-type") || "").includes("application/json");
}

const checks = [
  {
    name: "landing page",
    path: "/",
    redirect: "follow",
    expect: (response) => response.status === 200 && hasHtml(response),
  },
  {
    name: "guide page",
    path: "/guide",
    redirect: "follow",
    expect: (response) => response.status === 200 && hasHtml(response),
  },
  {
    name: "terms page",
    path: "/terms",
    redirect: "follow",
    expect: (response) => response.status === 200 && hasHtml(response),
  },
  {
    name: "privacy page",
    path: "/privacy",
    redirect: "follow",
    expect: (response) => response.status === 200 && hasHtml(response),
  },
  {
    name: "community guidelines page",
    path: "/community-guidelines",
    redirect: "follow",
    expect: (response) => response.status === 200 && hasHtml(response),
  },
  {
    name: "robots.txt",
    path: "/robots.txt",
    redirect: "follow",
    expect: (response) => response.status === 200,
  },
  {
    name: "questions API session sample",
    path: "/api/questions?session=1&count=1",
    redirect: "manual",
    expect: (response) => response.status === 200 && hasJson(response),
  },
  {
    name: "search API empty query",
    path: "/api/search?q=&limit=1",
    redirect: "manual",
    expect: (response) => response.status === 200 && hasJson(response),
  },
  {
    name: "dashboard requires login",
    path: "/dashboard",
    redirect: "manual",
    expect: (response) => isRedirectTo(response, "/auth/login"),
  },
  {
    name: "settings requires login",
    path: "/settings",
    redirect: "manual",
    expect: (response) => isRedirectTo(response, "/auth/login"),
  },
  {
    name: "board requires login",
    path: "/board",
    redirect: "manual",
    expect: (response) => isRedirectTo(response, "/auth/login"),
  },
  {
    name: "admin requires login",
    path: "/admin",
    redirect: "manual",
    expect: (response) => isRedirectTo(response, "/auth/login"),
  },
  {
    name: "notifications API requires login",
    path: "/api/notifications",
    redirect: "manual",
    expect: (response) => response.status === 401 && hasJson(response),
  },
  {
    name: "comment image sweep cron rejects unauthenticated request",
    path: "/api/cron/comment-image-sweep",
    redirect: "manual",
    expect: (response) => response.status === 401 && hasJson(response),
  },
  {
    name: "signup proof purge cron rejects unauthenticated request",
    path: "/api/cron/signup-proof-purge",
    redirect: "manual",
    expect: (response) => response.status === 401 && hasJson(response),
  },
];

async function runCheck(baseUrl, timeoutMs, check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl(baseUrl, check.path), {
      method: "GET",
      redirect: check.redirect,
      signal: controller.signal,
      headers: {
        "user-agent": "vet-exam-ai-smoke/1.0",
      },
    });
    const ok = check.expect(response);
    return {
      ok,
      name: check.name,
      path: check.path,
      status: response.status,
      location: response.headers.get("location") || "",
    };
  } catch (error) {
    return {
      ok: false,
      name: check.name,
      path: check.path,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatResult(result) {
  if (result.ok) {
    const target = result.location ? ` -> ${result.location}` : "";
    return `ok   ${result.name} (${result.status}${target})`;
  }

  if (result.error) {
    return `fail ${result.name}: ${result.error}`;
  }

  const target = result.location ? `, location=${result.location}` : "";
  return `fail ${result.name}: status=${result.status}${target}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  const baseUrl = normalizeBaseUrl(args.baseUrl);
  console.log(`public-smoke: target ${baseUrl}`);

  const results = [];
  for (const check of checks) {
    const result = await runCheck(baseUrl, args.timeoutMs, check);
    results.push(result);
    console.log(formatResult(result));
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`public-smoke: failed (${failed.length}/${results.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`public-smoke: ok (${results.length}/${results.length})`);
}

main().catch((error) => {
  console.error(`public-smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
