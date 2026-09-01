import { NextResponse } from "next/server";
import { z } from "zod";
import { getLead } from "@/lib/leads";
import { hydrateLeadMemory } from "@/lib/memory";
import { sendStaffOutreach } from "@/lib/staff-outreach-mail";

const bodySchema = z.object({
  leadId: z.string().optional(),
  channel: z.enum(["chat", "video"]).default("video"),
  userText: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let lead = parsed.data.leadId ? await getLead(parsed.data.leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }

  const result = await sendStaffOutreach({
    lead,
    channel: parsed.data.channel,
    userText: parsed.data.userText,
    recentMessages: lead?.conversation,
  });

  return NextResponse.json({
    ok: result.ok,
    duplicate: "duplicate" in result ? result.duplicate : false,
    content: result.parentReply,
  });
}
