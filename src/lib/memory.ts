import {
  type Lead,
  type LeadMessage,
  getLead,
  updateLead,
} from "./leads";
import {
  mayaGreeting,
  mayaReturningGreeting,
  parseChildAge,
} from "./greeting";
import {
  getGhlAppointment,
  ghlIsoToLocalStart,
  listGhlAppointmentsForContact,
  normalizeGhlAppointmentStatus,
} from "./ghl";
import { latestBookingForLead } from "./schedule";

const TZ = "America/Los_Angeles";
const MAX_TURNS = 40;
const WELCOME_BACK_MS = 10 * 60 * 1000;

export type BookingState = "none" | "upcoming" | "past";

export type BookingStatus = {
  state: BookingState;
  start?: string;
  label?: string;
  spoken?: string;
  ghlAppointmentId?: string;
  /** Live GHL appointmentStatus when we could fetch it. */
  ghlStatus?: string;
};

export type OpenLeadSession = {
  lead: Lead | null;
  messages: LeadMessage[];
  booking: BookingStatus;
  returning: boolean;
};

/** Interpret YYYY-MM-DDTHH:mm as Pacific wall time → UTC ms. */
export function pacificStartToUtcMs(start: string): number {
  const [datePart, timePart = "00:00"] = start.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  for (const offsetHours of [-7, -8]) {
    const utc = Date.UTC(y, mo - 1, d, hh - offsetHours, mm);
    const parts = pacificParts(new Date(utc));
    if (
      parts.year === y &&
      parts.month === mo &&
      parts.day === d &&
      parts.hour === hh &&
      parts.minute === mm
    ) {
      return utc;
    }
  }
  return Date.UTC(y, mo - 1, d, hh + 8, mm);
}

function pacificParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

export function spokenTrialTime(start: string, label?: string): string {
  if (label?.trim()) {
    // "Saturday 2026-08-15 11:00am–11:30am" → keep, but prefer a friendlier line
    const friendly = formatPacific(start);
    if (friendly) return friendly;
    return label.trim();
  }
  return formatPacific(start) || start;
}

function formatPacific(start: string): string | null {
  try {
    const ms = pacificStartToUtcMs(start);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

export function bookingStatusFor(
  bookedStart?: string | null,
  bookedLabel?: string | null,
  ghlAppointmentId?: string | null,
  ghlStatus?: string | null,
): BookingStatus {
  if (!bookedStart?.trim()) return { state: "none" };
  const start = bookedStart.trim();
  const ms = pacificStartToUtcMs(start);
  const spoken = spokenTrialTime(start, bookedLabel || undefined);
  const upcoming = ms > Date.now() - 30 * 60 * 1000; // still "upcoming" through the session
  return {
    state: upcoming ? "upcoming" : "past",
    start,
    label: bookedLabel || undefined,
    spoken,
    ghlAppointmentId: ghlAppointmentId || undefined,
    ghlStatus: normalizeGhlAppointmentStatus(ghlStatus) || ghlStatus || undefined,
  };
}

/** When the local slot is in the past, read live GHL status (showed / noshow / cancelled). */
export async function resolveBookingStatus(lead: {
  bookedStart?: string;
  bookedLabel?: string;
  ghlAppointmentId?: string;
  ghlContactId?: string;
}): Promise<BookingStatus> {
  const local = bookingStatusFor(
    lead.bookedStart,
    lead.bookedLabel,
    lead.ghlAppointmentId,
  );
  if (local.state !== "past") return local;

  let appt = lead.ghlAppointmentId
    ? await getGhlAppointment(lead.ghlAppointmentId)
    : null;

  if (!appt && lead.ghlContactId && lead.bookedStart) {
    const list = await listGhlAppointmentsForContact(lead.ghlContactId);
    const want = lead.bookedStart;
    appt =
      list.find((a) => a.startTime && ghlIsoToLocalStart(a.startTime) === want) ||
      list[0] ||
      null;
  }

  if (!appt?.appointmentStatus) return local;

  return {
    ...local,
    ghlAppointmentId: appt.id || local.ghlAppointmentId,
    ghlStatus: normalizeGhlAppointmentStatus(appt.appointmentStatus),
  };
}

export function trimConversation(
  messages: LeadMessage[],
  max = MAX_TURNS,
): LeadMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

export function mergeTranscripts(
  stored: LeadMessage[] = [],
  incoming: LeadMessage[] = [],
): LeadMessage[] {
  if (!stored.length) return incoming;
  if (!incoming.length) return stored;

  const key = (m: LeadMessage) => `${m.role}:${m.content}`;
  const storedKey = stored.map(key).join("\n");
  const incomingKey = incoming.map(key).join("\n");
  if (incomingKey.startsWith(storedKey) || storedKey.startsWith(incomingKey)) {
    return incoming.length >= stored.length ? incoming : stored;
  }

  const lastIn = incoming[incoming.length - 1];
  if (lastIn?.role === "user") {
    const already = stored.some(
      (m, i) => i === stored.length - 1 && key(m) === key(lastIn),
    );
    if (already) return stored;
    return trimConversation([...stored, lastIn]);
  }
  return trimConversation([...stored, ...incoming]);
}

export async function hydrateLeadMemory(lead: Lead): Promise<Lead> {
  if (lead.bookedStart?.trim()) return lead;
  const booking = await latestBookingForLead(
    lead.id,
    [lead.ghlContactId || ""],
  );
  if (!booking) return lead;
  const patched = await updateLead(lead.id, {
    bookedStart: booking.start,
    bookedLabel: booking.label,
    ghlAppointmentId: booking.ghlAppointmentId,
    ghlContactId: booking.ghlContactId || lead.ghlContactId,
    email: lead.email || booking.email,
  });
  return patched ?? {
    ...lead,
    bookedStart: booking.start,
    bookedLabel: booking.label,
    ghlAppointmentId: booking.ghlAppointmentId,
  };
}

function isWelcomeBack(content: string) {
  return /welcome back/i.test(content);
}

/** Load the lead, restore transcript + booking, and add a welcome-back if they returned later. */
export async function openLeadSession(leadId?: string): Promise<OpenLeadSession> {
  if (!leadId) {
    return {
      lead: null,
      messages: [{ role: "assistant", content: mayaGreeting() }],
      booking: { state: "none" },
      returning: false,
    };
  }

  const raw = await getLead(leadId);
  if (!raw) {
    return {
      lead: null,
      messages: [{ role: "assistant", content: mayaGreeting() }],
      booking: { state: "none" },
      returning: false,
    };
  }

  const lead = await hydrateLeadMemory(raw);
  const booking = await resolveBookingStatus(lead);
  const stored = lead.conversation ?? [];
  const hasHistory = stored.length > 0 || booking.state !== "none";
  const lastOpen = lead.lastOpenedAt ? Date.parse(lead.lastOpenedAt) : 0;
  const stale = !lastOpen || Date.now() - lastOpen > WELCOME_BACK_MS;
  const lastWasWelcome = stored.length
    ? isWelcomeBack(stored[stored.length - 1]?.content || "")
    : false;

  let messages: LeadMessage[];
  if (stored.length) {
    messages = [...stored];
  } else if (booking.state !== "none") {
    messages = [
      { role: "assistant", content: mayaReturningGreeting(lead, booking) },
    ];
  } else {
    messages = [{ role: "assistant", content: mayaGreeting(lead) }];
  }

  let persistTranscript = stored.length > 0 || booking.state !== "none";
  if (stored.length && stale && !lastWasWelcome) {
    const returningLine = mayaReturningGreeting(lead, booking);
    const last = messages[messages.length - 1];
    if (!last || last.content !== returningLine) {
      messages = trimConversation([
        ...messages,
        { role: "assistant", content: returningLine },
      ]);
      persistTranscript = true;
    }
  }

  const returning = hasHistory;
  await updateLead(lead.id, {
    lastOpenedAt: new Date().toISOString(),
    ...(persistTranscript ? { conversation: messages } : {}),
  });

  return {
    lead: { ...lead, conversation: messages, lastOpenedAt: new Date().toISOString() },
    messages,
    booking,
    returning,
  };
}

export function memoryPromptBlock(opts: {
  returning: boolean;
  booking: BookingStatus;
  transcript?: LeadMessage[];
}): string {
  const { returning, booking, transcript } = opts;
  const lines: string[] = [
    "## Returning conversation (critical)",
    returning
      ? "This parent reopened the SAME chat link. Continue the prior conversation — do not restart as a new intro, do not re-ask known age/location/email, and do not greet like a first meeting."
      : "This is a new conversation on this chat link (or no prior transcript yet).",
  ];

  if (booking.state === "upcoming") {
    lines.push(
      `BOOKING STATUS: UPCOMING free trial on ${booking.spoken} (${booking.start}).`,
      "They already booked. Do NOT push another trial. Ask if there's anything else, or help reschedule if they say the time no longer works.",
      "To reschedule: confirm a new open slot, then [BOOK:YYYY-MM-DDTHH:mm] (the system replaces the old appointment).",
    );
  } else if (booking.state === "past") {
    const ghl = (booking.ghlStatus || "unknown").toLowerCase();
    lines.push(
      `BOOKING STATUS: PAST free trial was ${booking.spoken} (${booking.start}).`,
      `GHL appointment status: ${ghl}. Respond from this status — do not guess.`,
    );
    if (ghl === "showed" || ghl === "completed") {
      lines.push(
        "They ATTENDED the trial. Ask how it went / answer membership or next-step questions. Do NOT assume they need to reschedule unless they ask.",
      );
    } else if (ghl === "noshow") {
      lines.push(
        "GHL marked this as a NO-SHOW. Be warm, no guilt. Offer to reschedule a new free session.",
      );
    } else if (ghl === "cancelled" || ghl === "invalid") {
      lines.push(
        "GHL shows the appointment was CANCELLED. Offer to book a new free session if they still want a trial.",
      );
    } else {
      lines.push(
        "Time has passed but GHL did not mark showed/noshow (still confirmed or unknown). Ask if they made it in, or help reschedule.",
      );
    }
  } else {
    lines.push("BOOKING STATUS: no trial on the calendar yet for this chat.");
  }

  const recent = (transcript || []).slice(-12);
  if (recent.length) {
    lines.push("PRIOR TRANSCRIPT (most recent turns — treat as already said):");
    for (const m of recent) {
      const who = m.role === "user" ? "Parent" : "Maya";
      lines.push(`- ${who}: ${m.content}`);
    }
  }

  const age = parseChildAge(
    recent
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ") || undefined,
  );
  if (age != null) {
    lines.push(`Age already appeared in this transcript (${age}) — do not ask again.`);
  }

  return lines.join("\n");
}
