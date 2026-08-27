# Steamoji Kirkland — Maya Video Chat Agent

An SMS-linkable AI enrollment agent for **Steamoji Kirkland**. Parents open a link, talk with **Maya** (female AI advisor), and get guided to book a free session.

## What you get

- Photoreal living video via [Tavus](https://www.tavus.io/) (high interruptibility — stops when parents talk)
- Short, engaging sales dialogue trained on your script/deck/qualification docs
- Free-session availability from `content/free-session-schedule.json`
- Personalized lead links + Twilio SMS / webhook for campaigns
- CTA to [book a free session](https://kirkland.steamoji.com/book-a-free-session)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste your Tavus API key under **Enable living video**.

## Text campaign: send Maya when a lead shows interest

**Goal:** keep the email if you want, but immediately text a Maya video link.

### Option A — Webhook from your email/CRM tool

When a lead submits interest (form, Zapier, HubSpot workflow, etc.), POST:

```bash
curl -X POST https://YOUR_DOMAIN/api/webhooks/lead-interested \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $LEAD_WEBHOOK_SECRET" \
  -d '{
    "name": "Sarah",
    "phone": "+14255551212",
    "childName": "Leo",
    "childAge": "8",
    "notes": "Filled website form",
    "sendSms": true
  }'
```

Response includes `chatUrl` and SMS status. Wire this into Zapier/Make/HubSpot instead of (or in addition to) the email step.

### Option B — Manual from `/send`

Open `/send` → **Text Maya now** (needs Twilio env vars).

### Required env for auto-text

```bash
PUBLIC_APP_URL=https://www.steamojikirkland.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
LEAD_WEBHOOK_SECRET=some-long-random-string
TAVUS_API_KEY=...
```

Chat links:

`https://www.steamojikirkland.com/chat/{leadId}`

The Railway URL (`https://maya-production-6815.up.railway.app`) still works as a backup. Leave `kirkland.steamoji.com` on GHL as-is (academy site / booking).

## Free-session schedule

Maya reads open slots from:

`content/free-session-schedule.json`

- Built from academy hours (Mon–Fri 2–7, Sat 10–7 Pacific)
- Add taken times to `blockedSlots` as `YYYY-MM-DDTHH:mm`
- Inspect via `GET /api/schedule` or `GET /api/schedule?day=saturday&time=3:00pm`

Later you can replace this file with your real booking API.

## Training content

| What | Where |
|------|--------|
| Knowledge / pricing / objections | `src/lib/steamoji-knowledge.ts` |
| Conversation style / flow | `src/lib/maya-persona.ts` |
| Opening line | `src/lib/greeting.ts` |
| Raw imports | `content/` |

After script changes, **start a new video call**.

## Stack

- Next.js App Router
- Tavus Conversational Video
- Twilio SMS (optional)
- Local lead store in `.data/`
