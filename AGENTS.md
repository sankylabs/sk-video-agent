<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install with `npm ci`. Start the app with `npm run dev` (hostname `0.0.0.0`, port 3000).
- Open http://localhost:3000 or http://127.0.0.1:3000. `allowedDevOrigins` in `next.config.ts` lets the dev server serve client JavaScript to `127.0.0.1`.
- Tavus, OpenAI, Twilio, GoHighLevel, Resend, and Postgres are optional. The site, events, local leads, and `GET /api/schedule` work without them. Leads and events are stored in `.data/`. See `.env.example` when you need those integrations.
- `npm run build` is the production check. `npm run lint` currently fails on existing issues in `src/components/LiveMaya.tsx`, `src/components/MayaReport.tsx`, and `src/app/chat/page.tsx`.
