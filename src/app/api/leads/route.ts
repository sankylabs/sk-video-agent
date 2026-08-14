import { NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/lib/leads";
import { buildMayaSms, sendSms } from "@/lib/sms";

const bodySchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  childName: z.string().trim().max(80).optional(),
  childAge: z.string().trim().max(20).optional(),
  childName2: z.string().trim().max(80).optional(),
  childAge2: z.string().trim().max(20).optional(),
  childName3: z.string().trim().max(80).optional(),
  childAge3: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  sendSms: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const lead = await createLead(parsed.data);
  const origin = process.env.PUBLIC_APP_URL || new URL(req.url).origin;
  const chatUrl = `${origin.replace(/\/$/, "")}/chat/${lead.id}`;
  const smsBody = buildMayaSms({
    chatUrl,
    name: lead.name,
    childName: lead.childName,
  });

  let sms: Awaited<ReturnType<typeof sendSms>> | null = null;
  if (parsed.data.sendSms) {
    if (!lead.phone) {
      return NextResponse.json(
        { error: "Phone is required to send SMS", lead, chatUrl, smsBody },
        { status: 400 },
      );
    }
    sms = await sendSms(lead.phone, smsBody);
  }

  return NextResponse.json({
    lead,
    chatUrl,
    smsBody,
    sms,
  });
}
