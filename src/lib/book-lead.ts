import { extractBookMarkers } from "./chat-actions";
import { type Lead, updateLead } from "./leads";
import {
  EMAIL_NEEDED_FOR_BOOKING,
  isValidParentEmail,
} from "./qualify";
import {
  answerAvailabilityQuestion,
  bookSlot,
  type BookingRecord,
} from "./schedule";

export type LeadBookResult =
  | { ok: true; booking: BookingRecord }
  | { ok: false; error: string; pending?: boolean };

export async function resolveBookStartFromSpeech(texts: string[]) {
  const combined = texts.filter((t) => t?.trim()).join("\n");
  if (!combined.trim()) return null;
  const markers = extractBookMarkers(combined);
  if (markers[0]) return markers[0];
  const lookup = await answerAvailabilityQuestion(combined, 21);
  return lookup.exact[0]?.start || null;
}

export async function commitLeadBooking(
  lead: Lead | null,
  start: string,
  opts?: { email?: string },
): Promise<LeadBookResult> {
  const email = (opts?.email || lead?.email)?.trim();
  if (!isValidParentEmail(email)) {
    if (lead?.id) {
      await updateLead(lead.id, { pendingBookStart: start });
    }
    return { ok: false, error: EMAIL_NEEDED_FOR_BOOKING, pending: true };
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
    return result;
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
