# Relay Route Profit Calculator

Independent trucking route-profit calculator for `relaycalculator.com`. This is a standalone Cloudflare Worker project and a BusinessStub digital property.

## Local development

Remote MCP clients can connect to `https://relaycalculator.com/mcp` over Streamable HTTP with no credentials. The remote tools are `calculate_relay_route_profit`, `read_relay_calculator_guide`, `read_trucker_chat`, and `post_trucker_chat`.

The calculator automatically applies EIA’s weekly on-highway diesel price. It uses the national average by default, or the driver’s saved state or permitted device location. ZIP entry uses Zippopotam.us. Device coordinates are rounded to two decimal places for the U.S. Census state lookup. A one-year first-party settings cookie remembers the state, last weekly benchmark, manual diesel preference and recurring truck costs. Shared route prices are preserved.

```sh
npm install
npm run dev
npm test
npm run build
npx wrangler deploy --dry-run
```

The Worker serves the Vite build and the public calculation API. A SQLite-backed Durable Object runs the public Trucker Chat room with hibernatable WebSockets, bounded history, per-connection rate limits, and no IP-address storage in the application database. The site also serves its agent-discovery surface: `/llms.txt`, `/sitemap.xml`, `/.well-known/agent-skills/index.json`, the published calculation skill, `/.well-known/ai-catalog.json`, `/.well-known/api-catalog`, `/.well-known/poppy.json`, and `/openapi.json`. The homepage registers WebMCP tools when the browser exposes the draft API.

The calculator is an independent estimate. Route calculations run locally in the visible form and use the driver’s own payout and cost assumptions.
