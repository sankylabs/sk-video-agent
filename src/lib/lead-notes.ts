import { createGhlContactNote, isGhlCalendarEnabled } from "./ghl";

type OutreachChannel = "chat" | "video";

export type LeadNoteAction =
  | "nurture-later"
  | "nurture-too-young"
  | "nurture-too-old"
  | "unqualified-age"
  | "unqualified-distance"
  | "staff-outreach"
  | "book"
  | "reschedule"
  | "cancel"
  | "book-fallback"
  | "reschedule-fallback"
  | "cancel-fallback";

const DEFAULT_DETAIL: Record<LeadNoteAction, string> = {
  "nurture-later":
    "location fits (Kirkland-area); not ready now — asked to revisit later",
  "nurture-too-young":
    "child is under 5 and the family wants to stay in touch / come later",
  "nurture-too-old":
    "child is over 14; no age-appropriate program now — reach out later",
  "unqualified-age": "child's age is outside 5–14",
  "unqualified-distance":
    "family said Kirkland is too far / a closer Steamoji is a better fit",
  "staff-outreach":
    "parent wants to speak with the Steamoji Kirkland team. Keep opportunity in Conversation",
  book: "free trial reserved",
  reschedule: "free trial moved to a new time",
  cancel: "free trial taken off the calendar",
  "book-fallback": "GHL book failed; asked staff to create the trial",
  "reschedule-fallback": "GHL reschedule failed; asked staff to move the trial",
  "cancel-fallback": "GHL cancel failed; asked staff to remove the trial",
};

export function mayaActionNote(
  action: LeadNoteAction,
  channel: OutreachChannel,
  detail?: string,
) {
  const body = (detail || DEFAULT_DETAIL[action]).trim();
  switch (action) {
    case "nurture-later":
    case "nurture-too-young":
    case "nurture-too-old":
      return `[maya] Nurturing (${channel}): ${body}.`;
    case "unqualified-age":
    case "unqualified-distance":
      return `[maya] Unqualified (${channel}): ${body}.`;
    case "staff-outreach":
      return `[maya] Staff outreach (${channel}): ${body}.`;
    case "book":
      return `[maya] Booked free trial (${channel}): ${body}.`;
    case "reschedule":
      return `[maya] Rescheduled free trial (${channel}): ${body}.`;
    case "cancel":
      return `[maya] Cancelled free trial (${channel}): ${body}.`;
    case "book-fallback":
    case "reschedule-fallback":
    case "cancel-fallback":
      return `[maya] ${DEFAULT_DETAIL[action]} (${channel}): ${body}.`;
    default:
      return `[maya] ${action} (${channel}): ${body}.`;
  }
}

export function previewLeadNotes(channel: OutreachChannel) {
  return (Object.keys(DEFAULT_DETAIL) as LeadNoteAction[]).map((action) => ({
    action,
    channel,
    note: mayaActionNote(action, channel),
  }));
}

export async function writeMayaLeadNote(
  contactId: string | undefined,
  body: string,
) {
  if (!contactId?.trim() || !isGhlCalendarEnabled()) {
    return { ok: false as const, skipped: true as const };
  }
  try {
    await createGhlContactNote(contactId.trim(), body);
    return { ok: true as const };
  } catch (err) {
    console.error("[lead-note] failed", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "note failed",
    };
  }
}
