import { NextResponse } from "next/server";
import { z } from "zod";
import {
  commitLeadBooking,
  commitLeadCancel,
  resolveBookStartFromSpeech,
} from "@/lib/book-lead";
import {
  claimsCalendarBooking,
  claimsCalendarCancel,
  extractBookMarkers,
  extractCancelMarkers,
  isCancelRequest,
  isExistingBookingRecap,
  isSlotConfirmation,
} from "@/lib/chat-actions";
import { ghlIsoToLocalStart } from "@/lib/ghl";
import { getLead } from "@/lib/leads";
import { hydrateLeadMemory } from "@/lib/memory";
import { sendBookingFallback } from "@/lib/staff-outreach-mail";

const bodySchema = z.object({
  leadId: z.string().optional(),
  userText: z.string().max(2000).optional(),
  replicaText: z.string().max(2000).optional(),
  cancel: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const replicaText = parsed.data.replicaText?.trim() || "";
  const userText = parsed.data.userText?.trim() || "";
  const replicaWants =
    extractBookMarkers(replicaText).length > 0 ||
    (claimsCalendarBooking(replicaText) &&
      !isExistingBookingRecap(replicaText));
  const userWants = isSlotConfirmation(userText);
  const wantsCancel =
    Boolean(parsed.data.cancel) ||
    extractCancelMarkers(replicaText).length > 0 ||
    claimsCalendarCancel(replicaText) ||
    (isCancelRequest(userText) && !userWants);

  if (!replicaWants && !userWants && !wantsCancel) {
    return NextResponse.json({ ok: false, skipped: true });
  }
  if (isExistingBookingRecap(replicaText) && !userWants && !wantsCancel) {
    return NextResponse.json({ ok: true, skipped: true, alreadyBooked: true });
  }

  let lead = parsed.data.leadId ? await getLead(parsed.data.leadId) : null;
  if (lead) {
    lead = await hydrateLeadMemory(lead);
  }

  if (wantsCancel && !userWants && !replicaWants) {
    const result = await commitLeadCancel(lead, {
      channel: "video",
      requestedText: userText || replicaText,
    });
    console.info("[video-cancel]", {
      ok: result.ok,
      userText: userText.slice(0, 180),
    });
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        cancelled: false,
        error: result.error,
        staffNotified: result.staffNotified,
        parentReply: result.parentReply,
        spoken: result.spoken,
      });
    }
    return NextResponse.json({
      ok: true,
      cancelled: true,
      spoken: result.spoken,
    });
  }

  const excludeStarts = lead?.bookedStart
    ? [ghlIsoToLocalStart(lead.bookedStart)]
    : [];
  const start = await resolveBookStartFromSpeech([userText, replicaText], {
    excludeStarts,
  });
  console.info("[video-book]", {
    replicaWants,
    userWants,
    start,
    userText: userText.slice(0, 180),
    replicaText: replicaText.slice(0, 180),
  });
  if (!start) {
    if (lead?.bookedStart && userWants && !replicaWants) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        alreadyBooked: true,
      });
    }
    if (!replicaWants) {
      return NextResponse.json({
        ok: false,
        error: "Could not match an open slot from that confirmation.",
      });
    }
    const fallback = await sendBookingFallback({
      lead,
      channel: "video",
      requestedText: [replicaText, userText].filter(Boolean).join("\n"),
      error: "Could not match an open slot from that confirmation.",
      intent: lead?.bookedStart ? "reschedule" : "book",
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
