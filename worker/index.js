import { calculateRouteProfit, FIELD_LIMITS, serializableResult } from "../src/calculator.js";
export { TruckerChatRoom } from "./trucker-chat-room.js";

const CUSTOM_HOST = "relaycalculator.com";
const WWW_HOST = `www.${CUSTOM_HOST}`;
const API_BODY_LIMIT = 8 * 1024;
const DISCOVERY_LINKS = [
  '</llms.txt>; rel="alternate"; type="text/plain"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
  '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
].join(", ");

const SKILL_PATH = "/.well-known/agent-skills/calculate-relay-route-profit/SKILL.md";
const SKILL = `---
name: calculate-relay-route-profit
description: Calculate and review estimated trucking route profit, margin, break-even payout, cost mix, and take/reprice/skip recommendation using RelayCalculator.com's published formula.
---

# Calculate Relay route profit

Use this skill when a visitor wants to estimate whether a trucking route is profitable before accepting it.

## Information to collect

- Total payout, including fuel surcharge.
- Base or linehaul rate used for percentage-based pay.
- Loaded and deadhead miles.
- Fuel price and expected MPG.
- Insurance and truck fixed cost allocated to the route or day.
- Maintenance reserve per total mile.
- Driver and dispatcher percentages of base rate.
- Tolls, parking, lodging, or other route costs.
- The visitor's minimum acceptable net margin.

## Calculation

1. Total miles = loaded miles + deadhead miles.
2. Fuel = total miles / MPG * fuel price.
3. Maintenance = total miles * maintenance reserve per mile.
4. Driver pay = base rate * driver percentage.
5. Dispatcher pay = base rate * dispatcher percentage.
6. Total costs = fuel + maintenance + insurance + truck fixed cost + driver pay + dispatcher pay + other costs.
7. Net profit = payout - total costs.
8. Net margin = net profit / payout.
9. Net per total mile = net profit / total miles.

Use TAKE when net profit is positive and margin meets the visitor's target, REPRICE when profit is positive but below target, and SKIP when estimated costs meet or exceed payout.

## Tools

- Browser agents can call the WebMCP tool \`calculate_relay_route_profit\` on the homepage.
- Other clients can POST JSON to \`/api/calculate\`; the OpenAPI description is at \`/openapi.json\`.
- A share URL contains only the numbers shown in the calculator. It does not book a load or send the data to RelayCalculator.com.

## Safety and limitations

This is an independent estimate, not accounting, tax, legal, safety, dispatch, or financial advice. Do not claim live Amazon Relay rates, load availability, guaranteed profit, or affiliation with Amazon. Ask the visitor to review all inputs and the visible deduction table before acting.
`;

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      return secure(request, json({ ok: false, error: "This calculator is temporarily unavailable." }, 503));
    }
  },
};

export async function handle(request, env) {
  const url = new URL(request.url);
  const redirect = canonicalRedirect(url, request);
  if (redirect) return secure(request, redirect);

  if (url.pathname === "/api/chat/general") return handleChat(request, env);
  if (url.pathname === "/api/calculate") return secure(request, await calculateApi(request));
  if (url.pathname === "/api/health") return secure(request, routeApi(request, "GET", () => json({ ok: true, service: "relay-calculator", version: "1.0.0" })));
  if (url.pathname === "/openapi.json") return secure(request, await routeDocument(request, () => openApi(url)));
  if (url.pathname === "/llms.txt") return secure(request, await routeDocument(request, () => text(serviceGuide(url), "text/plain; charset=utf-8")));
  if (url.pathname === "/robots.txt") return secure(request, await routeDocument(request, () => text(robots(url), "text/plain; charset=utf-8")));
  if (url.pathname === "/sitemap.xml") return secure(request, await routeDocument(request, () => text(sitemap(url), "application/xml; charset=utf-8")));
  if (url.pathname === SKILL_PATH) return secure(request, await routeDocument(request, () => publicMetadata(SKILL, "text/markdown; charset=utf-8")));
  if (url.pathname === "/.well-known/agent-skills/index.json") return secure(request, await routeDocument(request, () => agentSkills(url)));
  if (url.pathname === "/.well-known/ai-catalog.json") return secure(request, await routeDocument(request, () => aiCatalog(url)));
  if (url.pathname === "/.well-known/api-catalog") return secure(request, await routeDocument(request, () => apiCatalog(url)));
  if (url.pathname === "/.well-known/security.txt") return secure(request, await routeDocument(request, () => text(`Canonical: ${originFor(url)}/.well-known/security.txt\nExpires: 2027-11-14T00:00:00Z\n`, "text/plain; charset=utf-8")));
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return secure(request, json({ ok: false, error: "Not found" }, 404));

  if (!["GET", "HEAD"].includes(request.method)) return secure(request, methodNotAllowed("GET, HEAD"));
  if (url.pathname === "/" && prefersMarkdown(request.headers.get("Accept") || "")) {
    const type = preferredMarkdownType(request.headers.get("Accept") || "");
    return secure(request, new Response(request.method === "HEAD" ? null : serviceGuide(url), {
      headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "public, max-age=300", Vary: "Accept" },
    }));
  }

  const assetUrl = new URL(url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (asset.status === 404 && !assetUrl.pathname.includes(".")) {
    const fallback = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    return secure(request, new Response(request.method === "HEAD" ? null : fallback.body, { status: 404, headers: fallback.headers }));
  }
  if ((asset.headers.get("Content-Type") || "").includes("text/html")) {
    const nonce = randomNonce();
    const transformed = new HTMLRewriter().on("script", { element(element) { element.setAttribute("nonce", nonce); } }).transform(asset);
    const headers = new Headers(transformed.headers);
    headers.set("Content-Security-Policy", csp(nonce));
    headers.set("Link", DISCOVERY_LINKS);
    headers.set("Vary", appendVary(headers.get("Vary"), "Accept"));
    return secure(request, new Response(request.method === "HEAD" ? null : transformed.body, { status: transformed.status, headers }));
  }
  return secure(request, new Response(request.method === "HEAD" ? null : asset.body, { status: asset.status, headers: asset.headers }));
}

async function handleChat(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return secure(request, new Response("Trucker Chat requires a WebSocket connection.", {
      status: 426,
      headers: { "Content-Type": "text/plain; charset=utf-8", Upgrade: "websocket" },
    }));
  }
  const origin = request.headers.get("Origin");
  if (!sameHostOrigin(origin, url)) return secure(request, json({ ok: false, error: "Origin not allowed" }, 403));
  const nickname = cleanNickname(url.searchParams.get("name") || "");
  if (!nickname) return secure(request, json({ ok: false, error: "Choose a nickname using 2 to 24 letters, numbers, spaces, underscores, or hyphens." }, 400));
  const forwarded = new URL(request.url);
  forwarded.searchParams.set("name", nickname);
  const stub = env.TRUCKER_CHAT.getByName("general");
  return stub.fetch(new Request(forwarded, request));
}

function sameHostOrigin(origin, url) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === url.hostname && ["https:", "http:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function cleanNickname(value) {
  const nickname = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return nickname.length >= 2 && nickname.length <= 24 && /^[\p{L}\p{N} _-]+$/u.test(nickname) ? nickname : "";
}

function canonicalRedirect(url, request) {
  const canonical = new URL(url);
  const requestHost = (request.headers.get("Host") || canonical.host).split(":")[0].toLowerCase();
  let changed = false;
  if (requestHost === WWW_HOST) { canonical.hostname = CUSTOM_HOST; changed = true; }
  if (changed) canonical.protocol = "https:";
  if (/\/index\.html?$/i.test(canonical.pathname)) { canonical.pathname = canonical.pathname.replace(/\/index\.html?$/i, "/"); changed = true; }
  return changed ? new Response(null, { status: 308, headers: { Location: canonical.href, "Cache-Control": "public, max-age=3600" } }) : null;
}

async function calculateApi(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiCorsHeaders("POST, OPTIONS") });
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS");
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return json({ ok: false, error: "Send a JSON request." }, 415, apiCorsHeaders("POST, OPTIONS"));
  let raw;
  try {
    raw = await readJson(request, API_BODY_LIMIT);
  } catch (error) {
    if (error instanceof InputError) return json({ ok: false, error: error.message }, error.status, apiCorsHeaders("POST, OPTIONS"));
    throw error;
  }
  const validation = validateScenario(raw);
  if (validation) return json({ ok: false, error: validation }, 400, apiCorsHeaders("POST, OPTIONS"));
  const result = serializableResult(calculateRouteProfit(raw));
  return json({ ok: true, result, disclaimer: "Independent estimate only. Review every input before acting." }, 200, apiCorsHeaders("POST, OPTIONS"));
}

function validateScenario(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "The request body must be a JSON object.";
  const allowed = new Set(Object.keys(FIELD_LIMITS));
  for (const [key, candidate] of Object.entries(value)) {
    if (!allowed.has(key)) return `Unknown field: ${key}.`;
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) return `${key} must be a finite number.`;
    const [minimum, maximum] = FIELD_LIMITS[key];
    if (candidate < minimum || candidate > maximum) return `${key} must be between ${minimum} and ${maximum}.`;
  }
  return "";
}

async function readJson(request, maximum) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maximum) throw new InputError("The request is too large.", 413);
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new InputError("The request is too large.", 413); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(body || "{}"); } catch { throw new InputError("The request body is not valid JSON."); }
}

function routeApi(request, method, callback) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiCorsHeaders(`${method}, OPTIONS`) });
  if (request.method !== method) return methodNotAllowed(`${method}, OPTIONS`);
  return callback();
}

async function routeDocument(request, callback) {
  if (!["GET", "HEAD"].includes(request.method)) return methodNotAllowed("GET, HEAD");
  const response = await callback();
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

function originFor(url) {
  return url.hostname === WWW_HOST || url.hostname === CUSTOM_HOST ? `https://${CUSTOM_HOST}` : url.origin;
}

function serviceGuide(url) {
  const origin = originFor(url);
  return `# Relay Route Profit Calculator

Estimate a trucking route's true operating profit before accepting it. Enter the offer, loaded and deadhead miles, fuel economy, operating costs, and pay splits to see net profit, margin, net per total mile, break-even payout, and a take/reprice/skip recommendation.

Independent calculator. Not affiliated with Amazon.

## Calculator

[Open the calculator](${origin}/)

The calculation runs in the visitor's browser. Share links contain only the numbers shown in the calculator. RelayCalculator.com does not book loads, read a Relay account, or receive shared calculation values.

## Trucker Chat

The homepage includes a live public chat room for route and operating-cost discussion. Visitors choose a public nickname. The room retains the latest 100 messages and applies basic rate limits. It is user-generated content, not a source of verified rates or operational advice, and is not exposed as an agent tool.

## Formula

- Total miles = loaded miles + deadhead miles.
- Fuel = total miles / MPG * fuel price.
- Maintenance = total miles * maintenance reserve per mile.
- Driver and dispatcher pay are percentages of base rate.
- Total costs include fuel, maintenance, insurance, truck fixed cost, crew pay, and other route costs.
- Net profit = payout - total costs.
- Net margin = net profit / payout.
- Net per total mile = net profit / total miles.

## Agent access

- WebMCP tools on the homepage: calculate a route, load a scenario for review, and read this guide.
- [Public route-profit API](${origin}/openapi.json)
- [Agent skill](${origin}${SKILL_PATH})
- [Agent skills index](${origin}/.well-known/agent-skills/index.json)
- [AI catalog](${origin}/.well-known/ai-catalog.json)

## Limits

This calculator is an estimate, not accounting, tax, legal, safety, dispatch, or financial advice. It does not provide live rates or guarantee profit. Review every input and your contracts before accepting a load.

## Publisher

A [BusinessStub](https://businessstub.com/) digital property.
`;
}

function robots(url) {
  const origin = originFor(url);
  return `User-agent: *\nAllow: /\nDisallow: /api/\nContent-Signal: search=yes, ai-input=yes\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nHost: ${origin}\nSitemap: ${origin}/sitemap.xml\n`;
}

function sitemap(url) {
  const origin = originFor(url);
  const pages = ["/", "/llms.txt", SKILL_PATH, "/openapi.json"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((path) => `\n  <url><loc>${xml(origin + path)}</loc></url>`).join("")}\n</urlset>\n`;
}

async function agentSkills(url) {
  const origin = originFor(url);
  const digest = await sha256(SKILL);
  return publicJson({
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    version: "0.2.0",
    skills: [{
      name: "calculate-relay-route-profit",
      type: "skill-md",
      description: "Calculate estimated trucking route profit, margin, cost mix, break-even payout, and a take/reprice/skip recommendation.",
      url: `${origin}${SKILL_PATH}`,
      digest: `sha256:${digest}`,
    }],
  });
}

function aiCatalog(url) {
  const origin = originFor(url);
  return publicJson({
    specVersion: "1.0",
    host: { displayName: "Relay Route Profit Calculator", documentationUrl: `${origin}/llms.txt` },
    entries: [{
      identifier: "urn:air:relaycalculator.com:skill:calculate-relay-route-profit",
      displayName: "Calculate Relay route profit",
      type: "text/markdown",
      url: `${origin}${SKILL_PATH}`,
      description: "Estimate route profit from payout, miles, fuel, operating costs, and crew pay without booking or submitting anything.",
      representativeQueries: [
        "Is this Relay route profitable after fuel and deadhead?",
        "What payout do I need to break even on this route?",
        "Should I take, reprice, or skip this trucking load?"
      ],
    }],
  });
}

function apiCatalog(url) {
  const origin = originFor(url);
  return publicMetadata(JSON.stringify({ linkset: [{
    anchor: origin,
    "service-desc": [{ href: `${origin}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
    "service-doc": [{ href: `${origin}/llms.txt`, type: "text/plain" }],
    status: [{ href: `${origin}/api/health`, type: "application/json" }],
  }] }), "application/linkset+json");
}

function openApi(url) {
  const origin = originFor(url);
  return publicJson({
    openapi: "3.1.0",
    info: { title: "Relay Route Profit Calculator API", version: "1.0.0", description: "A public, side-effect-free API for estimating trucking route profit. Independent and not affiliated with Amazon." },
    servers: [{ url: origin }],
    paths: {
      "/api/calculate": {
        post: {
          operationId: "calculateRouteProfit",
          summary: "Calculate route profit",
          description: "Returns route costs, profit, margin, break-even payout, and a take/reprice/skip recommendation. This does not book a load or store the submitted values.",
          requestBody: { required: true, content: { "application/json": { schema: apiInputSchema() } } },
          responses: {
            "200": {
              description: "Calculated estimate",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "result"],
                    properties: { ok: { const: true }, result: { type: "object" }, disclaimer: { type: "string" } },
                  },
                },
              },
            },
            "400": { description: "Invalid calculator input" },
          },
        },
      },
      "/api/health": { get: { operationId: "getHealth", summary: "Check service health", responses: { "200": { description: "Service is available" } } } },
    },
  }, "application/vnd.oai.openapi+json; charset=utf-8");
}

function apiInputSchema() {
  const properties = {};
  for (const [key, [minimum, maximum]] of Object.entries(FIELD_LIMITS)) properties[key] = { type: "number", minimum, maximum };
  return { type: "object", additionalProperties: false, properties };
}

export function prefersMarkdown(accept) {
  const markdown = Math.max(exactMediaQuality(accept, "text/markdown"), exactMediaQuality(accept, "text/plain"));
  const html = mediaQuality(accept, "text/html");
  return markdown > 0 && markdown >= html;
}

function preferredMarkdownType(accept) {
  return exactMediaQuality(accept, "text/markdown") >= exactMediaQuality(accept, "text/plain") ? "text/markdown" : "text/plain";
}

function exactMediaQuality(accept, type) {
  let best = 0;
  for (const item of accept.split(",")) {
    const [range, ...parameters] = item.trim().toLowerCase().split(";");
    if (range !== type) continue;
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    if (Number.isFinite(quality) && quality >= 0 && quality <= 1) best = Math.max(best, quality);
  }
  return best;
}

function mediaQuality(accept, type) {
  if (!accept.trim()) return type === "text/html" ? 1 : 0;
  let best = 0;
  for (const item of accept.split(",")) {
    const [range, ...parameters] = item.trim().toLowerCase().split(";");
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    if (!Number.isFinite(quality) || quality < 0 || quality > 1) continue;
    const [wantedType, wantedSubtype] = type.split("/");
    const [rangeType, rangeSubtype] = range.split("/");
    if ((rangeType === "*" || rangeType === wantedType) && (rangeSubtype === "*" || rangeSubtype === wantedSubtype)) best = Math.max(best, quality);
  }
  return best;
}

function secure(request, response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Signal", "search=yes, ai-input=yes");
  if (!headers.has("Content-Security-Policy") && (headers.get("Content-Type") || "").includes("text/html")) headers.set("Content-Security-Policy", csp());
  if (["/", "/llms.txt", "/robots.txt", "/sitemap.xml"].includes(new URL(request.url).pathname)) headers.set("Link", DISCOVERY_LINKS);
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

function csp(nonce = "") {
  const script = nonce ? `'self' 'nonce-${nonce}'` : "'self'";
  return `default-src 'self'; script-src ${script}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`;
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

function apiCorsHeaders(methods) {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": methods, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" };
}

function publicMetadata(body, contentType) {
  return new Response(body, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}

function publicJson(value, contentType = "application/json; charset=utf-8") {
  return publicMetadata(JSON.stringify(value, null, 2), contentType);
}

function text(body, contentType) {
  return new Response(body, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" } });
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders } });
}

function methodNotAllowed(allow) {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: allow });
}

function appendVary(current, value) {
  return [...new Set([...(current || "").split(",").map((item) => item.trim()).filter(Boolean), value])].join(", ");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
