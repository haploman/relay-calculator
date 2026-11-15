# Relay Route Profit Calculator

Independent trucking route-profit calculator for `relaycalculator.com`. This is a standalone Cloudflare Worker project and a BusinessStub digital property.

## Local development

```sh
npm install
npm run dev
npm test
npm run build
npx wrangler deploy --dry-run
```

The Worker serves the Vite build and the public calculation API. A SQLite-backed Durable Object runs the public Trucker Chat room with hibernatable WebSockets, bounded history, per-connection rate limits, and no IP-address storage in the application database. The site also serves its agent-discovery surface: `/llms.txt`, `/sitemap.xml`, `/.well-known/agent-skills/index.json`, the published calculation skill, `/.well-known/ai-catalog.json`, `/.well-known/api-catalog`, `/.well-known/poppy.json`, and `/openapi.json`. The homepage registers WebMCP tools when the browser exposes the draft API.

The calculator is an independent estimate. It does not read an Amazon Relay account, provide live load data, accept or book loads, send calculations to a server from the visible form, or guarantee profit.
