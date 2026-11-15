const slug = "relay-calculator";
const upstream = "https://businessstub.com/api/v1/stubs/relay-calculator/inquiries";
const respond = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function inquiry(request, env, readJson, forward = fetch) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (request.headers.get("Origin") !== new URL(request.url).origin) return respond({ ok: false }, 403);
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") return respond({ ok: false }, 415);
  let data;
  try { data = await readJson(request, 16384); } catch (error) { return respond({ ok: false }, error.status || 400); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return respond({ ok: false }, 400);
  if (!env.STUB_INTAKE_KEY) return respond({ ok: false }, 503);
  if (data.test_mode || request.headers.has("X-BusinessStub-Test")) {
    return request.headers.get("X-Stub-Intake-Key") === env.STUB_INTAKE_KEY
      ? respond({ ok: true, test_mode: true }) : respond({ ok: false }, 403);
  }
  const { name, email, message } = data;
  if (![name, email, message].every(value => typeof value === "string" && value.trim())
      || name.length > 100 || email.length > 254 || message.length > 2000
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return respond({ ok: false }, 400);
  try {
    const result = await forward(upstream, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(14000),
      headers: { "Content-Type": "application/json", "X-Stub-Intake-Key": env.STUB_INTAKE_KEY, "BusinessStub-Integration-Version": "1" },
      body: JSON.stringify({ stub_slug: slug, name: name.trim(), email: email.trim(), message: message.trim(), interest_type: "Calculator support", source_page: "https://relaycalculator.com/help/" }),
    });
    if (result.ok && (await result.json()).ok === true) return respond({ ok: true });
    return respond({ ok: false }, result.status === 429 ? 429 : 502);
  } catch { return respond({ ok: false }, 502); }
}
