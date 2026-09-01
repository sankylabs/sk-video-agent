import { cancelGhlAppointment, ghlIsoToLocalStart, isGhlCalendarEnabled } from "./ghl";
import { extractBookMarkers } from "./chat-actions";
import { type Lead, updateLead } from "./leads";
import { spokenTrialTime } from "./memory";
import {
  EMAIL_NEEDED_FOR_BOOKING,
  isValidParentEmail,
} from "./qualify";
import {
  sendBookingFallback,
  type OutreachChannel,
} from "./staff-outreach-mail";
import {
  answerAvailabilityQuestion,
  bookSlot,
  markLocalBookingCancelled,
  type BookingRecord,
} from "./schedule";

export type LeadBookResult =
  | { ok: true; booking: BookingRecord }
  | {
      ok: false;
      error: string;
      pending?: boolean;
      staffNotified?: boolean;
      parentReply?: string;
      spoken?: string;
    };

export type LeadCancelResult =
  | { ok: true; spoken: string }
  | {
      ok: false;
      error: string;
      staffNotified?: boolean;
      parentReply?: string;
      spoken?: string;
    };

export async function resolveBookStartFromSpeech(
  texts: string[],
  opts?: { excludeStarts?: string[] },
) {
  const exclude = new Set(
    (opts?.excludeStarts ?? [])
      .map((s) => ghlIsoToLocalStart(s.trim()))
      .filter(Boolean),
  );
  const ordered = texts.map((t) => t?.trim()).filter(Boolean);
  if (!ordered.length) return null;

  const usable = (start: string | null | undefined) => {
    if (!start?.trim()) return null;
    const local = ghlIsoToLocalStart(start.trim());
    if (!local || exclude.has(local)) return null;
    return local;
  };

  for (const text of ordered) {
    for (const marker of extractBookMarkers(text)) {
      const hit = usable(marker);
      if (hit) return hit;
    }
  }

  for (const text of ordered) {
    const lookup = await answerAvailabilityQuestion(text, 21, {
      excludeStarts: [...exclude],
    });
    const hit = usable(lookup.exact[0]?.start);
    if (hit) return hit;
  }

  const combined = ordered.join("\n");
  const lookup = await answerAvailabilityQuestion(combined, 21, {
    excludeStarts: [...exclude],
  });
  return usable(lookup.exact[0]?.start);
}

export async function commitLeadBooking(
  lead: Lead | null,
  start: string,
  opts?: { email?: string; channel?: OutreachChannel; requestedText?: string },
): Promise<LeadBookResult> {
  const email = (opts?.email || lead?.email)?.trim();
  const spoken = spokenTrialTime(start);
  const normalized = ghlIsoToLocalStart(start.trim());
  if (
    lead?.bookedStart &&
    ghlIsoToLocalStart(lead.bookedStart) === normalized
  ) {
    return {
      ok: true,
      booking: {
        start: lead.bookedStart,
        label: lead.bookedLabel || spoken,
        email,
        name: lead.name,
        ghlContactId: lead.ghlContactId || lead.id,
        ghlAppointmentId: lead.ghlAppointmentId,
        source: "ghl",
        createdAt: lead.createdAt,
      },
    };
  }
  if (!isValidParentEmail(email)) {
    if (lead?.id) {
      await updateLead(lead.id, { pendingBookStart: start });
    }
    return { ok: false, error: EMAIL_NEEDED_FOR_BOOKING, pending: true, spoken };
  }

  const result = await bookSlot(start, {
    name: lead?.name,
    email,
    phone: lead?.phone,
    childName: lead?.childName,
    childAge: lead?.childAge,
    childName2: lead?.childName2,
    childAge2: lead?.childAge2,
    childName3: lead?.childName3,
    childAge3: lead?.childAge3,
    leadId: lead?.ghlContactId || lead?.id,
    ghlContactId: lead?.ghlContactId || lead?.id,
    previousAppointmentId: lead?.ghlAppointmentId,
  });

  if (!result.ok) {
    console.error("[book] bookSlot failed", start, result.error);
    if (
      lead?.bookedStart &&
      ghlIsoToLocalStart(lead.bookedStart) === normalized
    ) {
      return {
        ok: true,
        booking: {
          start: lead.bookedStart,
          label: lead.bookedLabel || spoken,
          email,
          name: lead.name,
          ghlContactId: lead.ghlContactId || lead.id,
          ghlAppointmentId: lead.ghlAppointmentId,
          source: "ghl",
          createdAt: lead.createdAt,
        },
      };
    }
    const fallback = await sendBookingFallback({
      lead,
      channel: opts?.channel || "chat",
      start,
      spoken,
      error: result.error,
      requestedText: opts?.requestedText,
      intent: lead?.bookedStart ? "reschedule" : "book",
    });
    return {
      ok: false,
      error: result.error,
      staffNotified: fallback.ok,
      parentReply: fallback.parentReply,
      spoken: fallback.spoken || spoken,
    };
  }

  if (lead?.id) {
    const patch: {
      ghlContactId?: string;
      pendingBookStart?: string;
      bookedStart?: string;
      bookedLabel?: string;
      ghlAppointmentId?: string;
    } = {
      pendingBookStart: undefined,
      bookedStart: result.booking.start,
      bookedLabel: result.booking.label,
    };
    if (result.booking.ghlContactId) {
      patch.ghlContactId = result.booking.ghlContactId;
    }
    if (result.booking.ghlAppointmentId) {
      patch.ghlAppointmentId = result.booking.ghlAppointmentId;
    }
    await updateLead(lead.id, patch);
  }

  return result;
}

export async function commitLeadCancel(
  lead: Lead | null,
  opts?: { channel?: OutreachChannel; requestedText?: string },
): Promise<LeadCancelResult> {
  const spoken =
    (lead?.bookedStart && spokenTrialTime(lead.bookedStart, lead.bookedLabel)) ||
    lead?.bookedLabel?.trim() ||
    "your free trial";
  if (!lead?.bookedStart && !lead?.ghlAppointmentId) {
    return { ok: false, error: "No appointment to cancel", spoken };
  }

  const appointmentId = lead.ghlAppointmentId?.trim();
  if (appointmentId && isGhlCalendarEnabled()) {
    try {
      await cancelGhlAppointment(appointmentId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "GHL cancel failed";
      console.error("[cancel] GHL cancel failed", appointmentId, message);
      const fallback = await sendBookingFallback({
        lead,
        channel: opts?.channel || "chat",
        start: lead.bookedStart,
        spoken,
        error: message,
        requestedText: opts?.requestedText,
        intent: "cancel",
      });
      return {
        ok: false,
        error: message,
        staffNotified: fallback.ok,
        parentReply: fallback.parentReply,
        spoken: fallback.spoken || spoken,
      };
    }
  } else if (!appointmentId && isGhlCalendarEnabled()) {
    const fallback = await sendBookingFallback({
      lead,
      channel: opts?.channel || "chat",
      start: lead.bookedStart,
      spoken,
      error: "No GHL appointment id on the lead",
      requestedText: opts?.requestedText,
      intent: "cancel",
    });
    return {
      ok: false,
      error: "No GHL appointment id on the lead",
      staffNotified: fallback.ok,
      parentReply: fallback.parentReply,
      spoken: fallback.spoken || spoken,
    };
  }

  await markLocalBookingCancelled({
    ghlAppointmentId: appointmentId,
    start: lead.bookedStart,
    leadId: lead.ghlContactId || lead.id,
  });

  if (lead.id) {
    await updateLead(lead.id, {
      bookedStart: undefined,
      bookedLabel: undefined,
      ghlAppointmentId: undefined,
      pendingBookStart: undefined,
    });
  }

  return { ok: true, spoken };
}
