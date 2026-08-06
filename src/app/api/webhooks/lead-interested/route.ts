import { NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/lib/leads";
import { buildMayaSms, sendSms } from "@/lib/sms";

/**
 * Call this from your email/CRM automation when a lead shows interest.
 * Creates a personalized Maya link and optionally texts it via Twilio.
 *
 * POST /api/webhooks/lead-interested
 * Header: x-webhook-secret: <LEAD_WEBHOOK_SECRET>  (if set)
 * Body: { name?, phone, childName?, childAge?, notes?, sendSms? }
 */
const bodySchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(7).max(40),
  childName: z.string().trim().max(80).optional(),
  childAge: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  sendSms: z.boolean().optional().default(true),
  baseUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body. Need at least phone." },
      { status: 400 },
    );
  }

  const lead = await createLead({
    name: parsed.data.name,
    phone: parsed.data.phone,
    childName: parsed.data.childName,
    childAge: parsed.data.childAge,
    notes: parsed.data.notes || "Source: lead-interested webhook",
  });

  const origin =
    parsed.data.baseUrl ||
    process.env.PUBLIC_APP_URL ||
    new URL(req.url).origin;
  const chatUrl = `${origin.replace(/\/$/, "")}/chat/${lead.id}`;
  const smsBody = buildMayaSms({
    chatUrl,
    name: lead.name,
    childName: lead.childName,
  });

  let smsResult: Awaited<ReturnType<typeof sendSms>> | null = null;
  if (parsed.data.sendSms) {
    smsResult = await sendSms(parsed.data.phone, smsBody);
  }

  return NextResponse.json({
    ok: true,
    lead,
    chatUrl,
    smsBody,
    sms: smsResult,
  });
}
