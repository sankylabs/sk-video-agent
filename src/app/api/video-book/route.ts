import { NextResponse } from "next/server";
import { z } from "zod";
import {
  commitLeadBooking,
  resolveBookStartFromSpeech,
} from "@/lib/book-lead";
import { claimsCalendarBooking, extractBookMarkers } from "@/lib/chat-actions";
import { getLead } from "@/lib/leads";
import { hydrateLeadMemory } from "@/lib/memory";
import { sendBookingFallback } from "@/lib/staff-outreach-mail";

const bodySchema = z.object({
  leadId: z.string().optional(),
  userText: z.string().max(2000).optional(),
  replicaText: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const replicaText = parsed.data.replicaText?.trim() || "";
  const userText = parsed.data.userText?.trim() || "";
  const wantsBook =
    extractBookMarkers(replicaText).length > 0 ||
    claimsCalendarBooking(replicaText);
  if (!wantsBook) {
    return NextResponse.json({ ok: false, skipped: true });
  }

  let lead = parsed.data.leadId ? await getLead(parsed.data.leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }

  const start = await resolveBookStartFromSpeech([replicaText, userText]);
  if (!start) {
    const fallback = await sendBookingFallback({
      lead,
      channel: "video",
      requestedText: [replicaText, userText].filter(Boolean).join("\n"),
      error: "Could not match an open slot from that confirmation.",
    });
    return NextResponse.json({
      ok: false,
      error: "Could not match an open slot from that confirmation.",
      staffNotified: fallback.ok,
      parentReply: fallback.parentReply,
      spoken: fallback.spoken,
    });
  }

  const result = await commitLeadBooking(lead, start, {
    channel: "video",
    requestedText: [userText, replicaText].filter(Boolean).join("\n"),
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error,
      pending: result.pending,
      staffNotified: result.staffNotified,
      parentReply: result.parentReply,
      spoken: result.spoken,
    });
  }

  return NextResponse.json({
    ok: true,
    booking: {
      start: result.booking.start,
      label: result.booking.label,
      ghlAppointmentId: result.booking.ghlAppointmentId,
    },
  });
}
