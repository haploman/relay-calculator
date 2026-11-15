# Agent readiness evidence

## Remote MCP release

The production scan at 2026-11-15T03:06:05Z returned Level 4 (Agent-Integrated) and passed the MCP server-card check. An official TypeScript MCP client discovered both tools on the canonical endpoint, called the guide, and received $483 estimated net profit for a $2,000 payout using the other example inputs.

## Public deployment

- Canonical URL: `https://relaycalculator.com/`
- Standard Worker URL: `https://relay-calculator.hap-loman.workers.dev/`
- Initial Worker version: `b6a378b5-70e7-4a08-b526-97c770b8722a`
- Final Worker version: `6c338e02-b155-4002-8643-33ac7668e93d`
- Final deployed implementation revision: `bb2152d`
- Initial scan: `2026-11-15T01:24:52.940Z`
- Final scan: `2026-11-15T01:27:52.017Z`
- Cloudflare result: **Level 4 — Agent-Integrated**

## Passing Cloudflare checks

- `robots.txt`
- Sitemap
- Agent-useful Link headers (`alternate`, `api-catalog`, `service-desc`)
- Homepage Markdown negotiation
- Explicit GPTBot, ClaudeBot and PerplexityBot rules
- Content Signals
- Public API Catalog with one real API
- Agent Skills index and exact SHA-256 digest
- Three WebMCP tools: `calculate_relay_route_profit`, `load_relay_route_scenario`, `read_relay_calculator_guide`
- ARD capability manifest with the real route-profit skill

## Additional direct verification

- Canonical and Worker hosts returned HTML for a browser request and Markdown for `Accept: text/markdown`.
- The public calculation API returned the expected 1,100 total miles for a 1,000-mile route with 100 deadhead miles.
- The production Trucker Chat endpoint completed a `101 Switching Protocols` handshake without posting a message.
- The published Agent Skill bytes matched the index digest `sha256:46c7e9153e27af905ae25c1fd0f9a5f799d3918500f38f5c66beeadca0ed13f4`.

## DNS-AID and DNSSEC

- Created `_index._agents.relaycalculator.com` SVCB priority 1 → `relaycalculator.com.` with `alpn="h2" port=443 mandatory=alpn,port`, TTL 300.
- Created the matching TXT path companion for `/.well-known/agent-skills/index.json`, TTL 300.
- Enabled standard Cloudflare DNSSEC. Cloudflare reported `pending` while Registrar submits the parent DS.
- Expected DS: `2371 13 2 F179E9C2C40966336721B3AEFEEA2F115D60A81876C1C9454567FEE2F8EC9433`.
- The initial scanner run correctly reported DNS-AID present but not yet DNSSEC-validated. This is a propagation/delegation follow-up, not an invitation to replace the signing key or duplicate records.

## Initial release scope

The initial scan preceded the public remote MCP endpoint and its server card. The calculator has no authenticated agent service or commerce workflow.

The current Poppy 1.0 website-only manifest is also published on the canonical host. The scanner used for the initial run did not yet support that version, so it is recorded as direct evidence rather than claimed as a scanner pass.
