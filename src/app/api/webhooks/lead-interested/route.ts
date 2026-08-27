import { NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/lib/leads";
import { getGhlContact } from "@/lib/ghl";
import { buildMayaSms, sendSms } from "@/lib/sms";

/**
 * GHL / CRM webhook when a lead shows interest.
 *
 * Chat URL is always /chat/{GHL contact id}:
 *   https://www.steamojikirkland.com/chat/{{contact.id}}
 *
 * POST /api/webhooks/lead-interested
 * Header: x-webhook-secret: <LEAD_WEBHOOK_SECRET>
 * Body: { contactId or ghlContactId, name?, email?, phone?, childName?, ... }
 */
const bodySchema = z
  .object({
    contactId: z.string().trim().min(4).max(80).optional(),
    ghlContactId: z.string().trim().min(4).max(80).optional(),
    name: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(120).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
    childName: z.string().trim().max(80).optional(),
    childAge: z.string().trim().max(20).optional(),
    childName2: z.string().trim().max(80).optional(),
    childAge2: z.string().trim().max(20).optional(),
    childName3: z.string().trim().max(80).optional(),
    childAge3: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(500).optional(),
    sendSms: z.boolean().optional().default(false),
    baseUrl: z.string().url().optional(),
  })
  .refine(
    (d) => d.contactId || d.ghlContactId || d.phone || d.email,
    { message: "Need contactId, email, or phone" },
  );

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
      { error: "Invalid body. Need GHL contactId, email, or phone." },
      { status: 400 },
    );
  }

  const contactId = parsed.data.contactId || parsed.data.ghlContactId;
  const fromGhl = contactId ? await getGhlContact(contactId) : null;

  const lead = await createLead({
    id: fromGhl?.id || contactId,
    ghlContactId: fromGhl?.id || contactId,
    name: parsed.data.name || fromGhl?.name,
    email: parsed.data.email || fromGhl?.email,
    phone: parsed.data.phone || fromGhl?.phone,
    childName: parsed.data.childName || fromGhl?.childName,
    childAge: parsed.data.childAge || fromGhl?.childAge,
    childName2: parsed.data.childName2 || fromGhl?.childName2,
    childAge2: parsed.data.childAge2 || fromGhl?.childAge2,
    childName3: parsed.data.childName3 || fromGhl?.childName3,
    childAge3: parsed.data.childAge3 || fromGhl?.childAge3,
    childSchool: fromGhl?.childSchool,
    childGrade: fromGhl?.childGrade,
    location: fromGhl?.location,
    resideKirkland: fromGhl?.resideKirkland,
    city: fromGhl?.city,
    tags: fromGhl?.tags,
    opportunityStage: fromGhl?.opportunityStage,
    interestedInTrial: fromGhl?.interestedInTrial,
    crmNotes: fromGhl?.crmNotes,
    notes: parsed.data.notes || "Source: lead-interested webhook",
  });

  const origin =
    parsed.data.baseUrl ||
    process.env.PUBLIC_APP_URL ||
    new URL(req.url).origin;
  const chatUrl = `${origin.replace(/\/$/, "")}/chat/${lead.ghlContactId || lead.id}`;
  const smsBody = buildMayaSms({
    chatUrl,
    name: lead.name,
    childName: lead.childName,
  });

  let smsResult: Awaited<ReturnType<typeof sendSms>> | null = null;
  const phone = lead.phone || parsed.data.phone;
  if (parsed.data.sendSms) {
    if (!phone) {
      return NextResponse.json(
        { error: "Phone is required to send SMS", lead, chatUrl, smsBody },
        { status: 400 },
      );
    }
    smsResult = await sendSms(phone, smsBody);
  }

  return NextResponse.json({
    ok: true,
    lead: { ...lead, conversation: undefined },
    chatUrl,
    smsBody,
    sms: smsResult,
  });
}
