import { promises as fs } from "fs";
import path from "path";
import {
  createGhlAppointment,
  createGhlAppointmentNote,
  fetchGhlFreeSlotIsos,
  ghlIsoToLocalStart,
  isGhlCalendarEnabled,
  upsertGhlContact,
  cancelGhlAppointment,
} from "./ghl";
import { isValidParentEmail } from "./qualify";
import { buildTrialSubject } from "./trial-subject";
import { isMoreOptionsRequest } from "./chat-actions";

export const EMAIL_REQUIRED_BOOKING_ERROR =
  "A parent email is required to book this free session. Please share your email so we can send the calendar invite.";

export type DayHours = { open: string; close: string } | null;

export type ScheduleConfig = {
  timezone: string;
  sessionMinutes: number;
  weeklyHours: Record<string, DayHours>;
  slotIntervalMinutes: number;
  blockedSlots: string[];
  notes?: string;
};

export type FreeSlot = {
  /** Local wall BOOK id: YYYY-MM-DDTHH:mm (America/Los_Angeles). */
  start: string;
  end: string;
  label: string;
  dayKey: string;
  /** Exact ISO start from GHL free-slots (preferred when booking). */
  ghlStartTime?: string;
};

const scheduleFile = path.join(
  process.cwd(),
  "content",
  "free-session-schedule.json",
);

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function formatHm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Local calendar date parts in a timezone. */
function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekday = (parts.weekday || "Monday").toLowerCase();
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday,
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

function localDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export async function loadScheduleConfig(): Promise<ScheduleConfig> {
  const raw = await fs.readFile(scheduleFile, "utf8");
  return JSON.parse(raw) as ScheduleConfig;
}

async function saveScheduleConfig(config: ScheduleConfig) {
  await fs.writeFile(scheduleFile, JSON.stringify(config, null, 2), "utf8");
}

const bookingsFile = path.join(process.cwd(), ".data", "bookings.json");

export type BookingRecord = {
  start: string;
  label?: string;
  name?: string;
  email?: string;
  phone?: string;
  childName?: string;
  childAge?: string;
  childName2?: string;
  childAge2?: string;
  childName3?: string;
  childAge3?: string;
  notes?: string;
  leadId?: string;
  ghlContactId?: string;
  ghlAppointmentId?: string;
  /** Cancel this GHL appointment after a successful new book (reschedule). */
  previousAppointmentId?: string;
  source?: "ghl" | "local";
  createdAt: string;
};

function slotFromGhlIso(iso: string, sessionMinutes: number): FreeSlot {
  const start = ghlIsoToLocalStart(iso);
  const dayKey = start.slice(0, 10);
  const hm = start.split("T")[1] || "00:00";
  const [h, m] = hm.split(":").map(Number);
  const startMins = h * 60 + m;
  const endMins = startMins + sessionMinutes;
  const weekday = zonedParts(new Date(iso), "America/Los_Angeles").weekday;
  const weekdayNice = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return {
    start,
    end: `${dayKey}T${pad(Math.floor(endMins / 60))}:${pad(endMins % 60)}`,
    dayKey,
    label: `${weekdayNice} ${dayKey} ${formatHm(startMins)}–${formatHm(endMins)}`,
    ghlStartTime: iso,
  };
}

async function persistLocalBooking(booking: BookingRecord) {
  await fs.mkdir(path.dirname(bookingsFile), { recursive: true });
  let existing: BookingRecord[] = [];
  try {
    existing = JSON.parse(await fs.readFile(bookingsFile, "utf8")) as BookingRecord[];
  } catch {
    existing = [];
  }
  existing.push(booking);
  await fs.writeFile(bookingsFile, JSON.stringify(existing, null, 2), "utf8");
}

async function readAllBookings(): Promise<BookingRecord[]> {
  try {
    return JSON.parse(await fs.readFile(bookingsFile, "utf8")) as BookingRecord[];
  } catch {
    return [];
  }
}

export async function latestBookingForLead(
  leadId: string,
  extraIds: string[] = [],
): Promise<BookingRecord | null> {
  const ids = new Set(
    [leadId, ...extraIds].map((s) => s.trim()).filter(Boolean),
  );
  const all = (await readAllBookings()).filter(
    (b) => (b.leadId && ids.has(b.leadId)) || (b.ghlContactId && ids.has(b.ghlContactId)),
  );
  if (!all.length) return null;
  all.sort((a, b) => {
    const byStart = (b.start || "").localeCompare(a.start || "");
    if (byStart) return byStart;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  return all[0] ?? null;
}

export async function bookSlot(
  start: string,
  meta?: Omit<BookingRecord, "start" | "createdAt">,
): Promise<{ ok: true; booking: BookingRecord } | { ok: false; error: string }> {
  const normalized = ghlIsoToLocalStart(start.trim());
  const slots = await getUpcomingSlots(21);
  const match = slots.find((s) => s.start === normalized);
  if (!match) {
    return {
      ok: false,
      error: `That time is not open on the calendar (${normalized}).`,
    };
  }

  const email = meta?.email?.trim();
  if (!isValidParentEmail(email)) {
    return {
      ok: false,
      error: EMAIL_REQUIRED_BOOKING_ERROR,
    };
  }

  if (isGhlCalendarEnabled()) {
    try {
      const upserted = await upsertGhlContact({
        name: meta?.name,
        email,
        phone: meta?.phone,
      });
      const contactId = upserted.contactId || meta?.ghlContactId;
      if (!contactId) {
        return { ok: false, error: "GHL did not return a contact id" };
      }

      const title = buildTrialSubject(meta || {});

      const appt = await createGhlAppointment({
        contactId,
        startTime: match.ghlStartTime || normalized,
        title,
        // Leave invite description empty — private notes go below.
        description: "",
        toNotify: true,
      });

      if (appt.appointmentId) {
        const privateNotes = [
          "Booked by Maya",
          meta?.notes?.trim() || null,
          meta?.leadId ? `Maya lead: ${meta.leadId}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        try {
          await createGhlAppointmentNote(appt.appointmentId, privateNotes);
        } catch (noteErr) {
          console.error("[schedule] GHL private note failed", noteErr);
        }
      }

      const booking: BookingRecord = {
        start: normalized,
        label: match.label,
        ...meta,
        email,
        ghlContactId: contactId,
        ghlAppointmentId: appt.appointmentId,
        source: "ghl",
        createdAt: new Date().toISOString(),
      };
      await persistLocalBooking(booking);
      if (
        meta?.previousAppointmentId &&
        meta.previousAppointmentId !== appt.appointmentId
      ) {
        try {
          await cancelGhlAppointment(meta.previousAppointmentId);
        } catch (cancelErr) {
          console.error("[schedule] GHL cancel previous failed", cancelErr);
        }
      }
      return { ok: true, booking };
    } catch (err) {
      const message = err instanceof Error ? err.message : "GHL booking failed";
      return { ok: false, error: message };
    }
  }

  // Local fallback when GHL env is not set.
  const config = await loadScheduleConfig();
  if (!config.blockedSlots.includes(normalized)) {
    config.blockedSlots = [...config.blockedSlots, normalized];
    await saveScheduleConfig(config);
  }

  const booking: BookingRecord = {
    start: normalized,
    label: match.label,
    ...meta,
    email,
    source: "local",
    createdAt: new Date().toISOString(),
  };
  await persistLocalBooking(booking);
  return { ok: true, booking };
}

async function getLocalUpcomingSlots(daysAhead = 14): Promise<FreeSlot[]> {
  const config = await loadScheduleConfig();
  const blocked = new Set(config.blockedSlots);
  const now = new Date();
  const slots: FreeSlot[] = [];

  for (let d = 0; d < daysAhead; d++) {
    const probe = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    // Sample midday to stabilize weekday in TZ
    const midday = new Date(probe);
    midday.setUTCHours(20, 0, 0, 0);
    const parts = zonedParts(midday, config.timezone);
    const hours = config.weeklyHours[parts.weekday];
    if (!hours) continue;

    const open = parseHm(hours.open);
    const close = parseHm(hours.close);
    const dateKey = localDateKey(parts);

    for (
      let start = open;
      start + config.sessionMinutes <= close;
      start += config.slotIntervalMinutes
    ) {
      const end = start + config.sessionMinutes;
      const startLabel = `${dateKey}T${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
      if (blocked.has(startLabel)) continue;

      // Skip past slots for today
      if (d === 0) {
        const nowParts = zonedParts(now, config.timezone);
        const nowMins = nowParts.hour * 60 + nowParts.minute;
        if (start <= nowMins + 30) continue;
      }

      const weekdayNice =
        parts.weekday.charAt(0).toUpperCase() + parts.weekday.slice(1);
      slots.push({
        start: startLabel,
        end: `${dateKey}T${pad(Math.floor(end / 60))}:${pad(end % 60)}`,
        dayKey: dateKey,
        label: `${weekdayNice} ${dateKey} ${formatHm(start)}–${formatHm(end)}`,
      });
    }
  }

  return slots;
}

export async function getUpcomingSlots(daysAhead = 14): Promise<FreeSlot[]> {
  const config = await loadScheduleConfig();

  if (isGhlCalendarEnabled()) {
    try {
      const isos = await fetchGhlFreeSlotIsos(daysAhead, config.timezone);
      return isos.map((iso) => slotFromGhlIso(iso, config.sessionMinutes));
    } catch (err) {
      console.error("[schedule] GHL free-slots failed; falling back to local", err);
    }
  }

  return getLocalUpcomingSlots(daysAhead);
}

export function findSlotsForDay(slots: FreeSlot[], dayHint: string) {
  const hint = dayHint.trim().toLowerCase();
  return slots.filter((s) => {
    const label = s.label.toLowerCase();
    return (
      label.includes(hint) ||
      s.dayKey.includes(hint) ||
      s.start.includes(hint)
    );
  });
}

export function matchRequestedTime(
  slots: FreeSlot[],
  dayHint: string,
  timeHint: string,
) {
  const daySlots = dayHint ? findSlotsForDay(slots, dayHint) : slots;
  const t = timeHint.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return { matches: daySlots.slice(0, 8), exact: [] as FreeSlot[] };

  const exact = daySlots.filter((s) => {
    const compact = s.label.toLowerCase().replace(/\s+/g, "");
    return compact.includes(t) || s.start.includes(t);
  });

  return { matches: daySlots.slice(0, 12), exact };
}

function timeRangePhrase(slot: FreeSlot) {
  return slot.label.split(" ").slice(2).join(" ");
}

function startTimePhrase(slot: FreeSlot) {
  const range = timeRangePhrase(slot);
  return range.split("–")[0] || range;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_WORD =
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today";

const MONTH_WORD =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function mentionsCalendarDate(text: string) {
  const t = text.toLowerCase();
  return (
    new RegExp(`\\b(${MONTH_WORD})\\s+\\d{1,2}(st|nd|rd|th)?\\b`).test(t) ||
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t)
  );
}

/** Detect booking / open-slot questions (including short day/date follow-ups). */
export function isAvailabilityQuestion(
  text: string,
  priorAssistant?: string,
) {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  if (isMoreOptionsRequest(t)) return true;

  // "What do you do in a free trial?" is experiential — not a slot lookup
  if (
    /\b(what (do you|happens|is it like)|what'?s it like|tell me about|walk me through|during|in a)\b/.test(
      t,
    ) &&
    /\b(free )?(trial|session|visit|tour)\b/.test(t) &&
    !/\b(available|availability|open|times?|slots?|book|schedule|when|calendar)\b/.test(
      t,
    )
  ) {
    return false;
  }

  // Weekday morning / before-2pm policy questions — not a calendar lookup
  if (
    /\b(before\s*2|morning)\b/.test(t) &&
    /\b(visit|tour|come|trial|session)\b/.test(t) &&
    !/\b(\d{1,2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/.test(t)
  ) {
    return false;
  }

  if (
    /\b(available|availability|open slots?|free slots?|what times?|which times?|book|booking|reserve|appointment|come in|come by|visit|tour|slots?)\b/.test(
      t,
    )
  ) {
    return true;
  }

  if (
    new RegExp(`\\b(${DAY_WORD}|this week|next week)\\b`).test(t) &&
    /\b(time|times|open|free|slot|session|trial|come|visit|available|afternoon|morning|evening)\b/.test(
      t,
    )
  ) {
    return true;
  }

  const mentionsDay = new RegExp(`\\b(${DAY_WORD})\\b`).test(t);
  const hasDate = mentionsCalendarDate(t);

  // "friday?", "next friday", "this monday", "sept 1", "9/1"
  if (mentionsDay || hasDate) {
    if (
      new RegExp(
        `^((this|next)\\s+)?(on\\s+)?(${DAY_WORD})\\??\\.?$`,
      ).test(t)
    ) {
      return true;
    }
    if (
      new RegExp(
        `^(on\\s+)?(${MONTH_WORD})\\s+\\d{1,2}(st|nd|rd|th)?\\??\\.?$`,
      ).test(t) ||
      /^\d{1,2}\/\d{1,2}(\/\d{2,4})?\??\.?$/.test(t) ||
      /^\d{4}-\d{2}-\d{2}\??\.?$/.test(t)
    ) {
      return true;
    }
    if (
      /\b(what about|how about|and|instead|or|maybe|then|also|next|this)\b/.test(
        t,
      ) &&
      t.length <= 80
    ) {
      return true;
    }
  }

  // Continue calendar thread: prior turn offered times, parent names another day/date/time
  if (
    priorAssistant &&
    /\b(open trial|open slots?|on our calendar|which works|nearby opens|trial times)\b/i.test(
      priorAssistant,
    ) &&
    (mentionsDay ||
      hasDate ||
      /\b(\d{1,2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/.test(t) ||
      /\b(earlier|later|morning|afternoon|evening|that one|the first|second)\b/.test(
        t,
      ))
  ) {
    return true;
  }

  return false;
}

/** Parse "10am", "10:30 pm", "14:00" → minutes from midnight, or null. */
export function parseTimeToMinutes(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?(a\.?m\.?|p\.?m\.?)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] || 0);
    const mer = ampm[3].replace(/\./g, "");
    if (h === 12) h = 0;
    if (mer.startsWith("p")) h += 12;
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  const mil = t.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) {
    const h = Number(mil[1]);
    const m = Number(mil[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  return null;
}

function addCalendarDays(
  parts: { year: number; month: number; day: number },
  delta: number,
  timezone: string,
) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + delta, 20, 0, 0);
  return zonedParts(new Date(utc), timezone);
}

function weekdayIndex(name: string) {
  return WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
}

/** Resolve a spoken/typed date to YYYY-MM-DD in academy timezone. */
export function resolveDateKey(
  text: string,
  timezone: string,
): { dateKey: string; label: string } | null {
  const t = text.toLowerCase().trim();
  const now = zonedParts(new Date(), timezone);

  if (/\btoday\b/.test(t)) {
    const key = localDateKey(now);
    return { dateKey: key, label: `today (${key})` };
  }
  if (/\btomorrow\b/.test(t)) {
    const next = addCalendarDays(now, 1, timezone);
    const key = localDateKey(next);
    return { dateKey: key, label: `tomorrow (${key})` };
  }

  // YYYY-MM-DD
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const key = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return { dateKey: key, label: key };
  }

  // M/D or M/D/YYYY
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : now.year;
    if (year < 100) year += 2000;
    if (!slash[3]) {
      const candidate = Date.UTC(year, month - 1, day);
      const todayUtc = Date.UTC(now.year, now.month - 1, now.day);
      if (candidate < todayUtc) year += 1;
    }
    const key = `${year}-${pad(month)}-${pad(day)}`;
    return { dateKey: key, label: key };
  }

  // Sept 1, September 1st, sept 1 2026
  const named = t.match(
    new RegExp(
      `\\b(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`,
    ),
  );
  if (named) {
    const monthToken = named[1].replace(/\./g, "");
    const month =
      MONTH_INDEX[monthToken] ||
      MONTH_INDEX[monthToken.slice(0, 3)] ||
      MONTH_INDEX[monthToken === "sept" ? "sept" : monthToken.slice(0, 4)];
    const day = Number(named[2]);
    let year = named[3] ? Number(named[3]) : now.year;
    if (!named[3]) {
      const candidate = Date.UTC(year, (month || 1) - 1, day);
      const todayUtc = Date.UTC(now.year, now.month - 1, now.day);
      if (candidate < todayUtc) year += 1;
    }
    if (!month || day < 1 || day > 31) return null;
    const key = `${year}-${pad(month)}-${pad(day)}`;
    const nice = `${monthToken[0].toUpperCase()}${monthToken.slice(1)} ${day}`;
    return { dateKey: key, label: nice };
  }

  // next Friday / this Monday / Friday
  for (const day of WEEKDAYS) {
    if (!new RegExp(`\\b${day}\\b`).test(t)) continue;
    const want = weekdayIndex(day);
    if (want < 0) continue;

    const todayDow = weekdayIndex(now.weekday);
    let delta = (want - todayDow + 7) % 7; // soonest including today
    const wantsNext = /\bnext\b/.test(t);
    const wantsThis = /\bthis\b/.test(t);

    if (wantsNext) {
      // Friday after the soonest upcoming one
      delta = delta + 7;
    } else if (!wantsThis && delta === 0 && !/\btoday\b/.test(t)) {
      // bare weekday on that same weekday → today
    }

    const target = addCalendarDays(now, delta, timezone);
    const key = localDateKey(target);
    const prefix = wantsNext ? "next " : wantsThis ? "this " : "";
    return {
      dateKey: key,
      label: `${prefix}${day} (${key})`,
    };
  }

  return null;
}

export function extractDayTimeHints(text: string, timezone = "America/Los_Angeles") {
  const t = text.toLowerCase();
  const resolved = resolveDateKey(text, timezone);
  let dayHint = resolved?.dateKey || "";

  if (!dayHint) {
    for (const day of WEEKDAYS) {
      if (t.includes(day)) {
        dayHint = day;
        break;
      }
    }
    if (!dayHint && /\btomorrow\b/.test(t)) dayHint = "tomorrow";
    if (!dayHint && /\btoday\b/.test(t)) dayHint = "today";
  }

  const timeMatch =
    t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/) ||
    t.match(/\b(\d{1,2}):(\d{2})\b/);
  let timeHint = "";
  if (timeMatch) {
    // Avoid treating "sept 1" style as a time — require am/pm or :mm
    const raw = timeMatch[0];
    if (/[ap]\.?m\.?/i.test(raw) || raw.includes(":")) {
      timeHint = raw.replace(/\s+/g, "");
    }
  }

  return {
    dayHint,
    dateLabel: resolved?.label || dayHint,
    timeHint,
    timeMinutes: parseTimeToMinutes(timeHint),
  };
}

function resolveRelativeDay(
  dayHint: string,
  timezone: string,
  slots: FreeSlot[],
): FreeSlot[] {
  const hint = dayHint.trim().toLowerCase();
  if (!hint) return slots;

  // Exact calendar day
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) {
    return slots.filter((s) => s.dayKey === hint);
  }

  if (hint === "today" || hint === "tomorrow") {
    const resolved = resolveDateKey(hint, timezone);
    if (!resolved) return [];
    return slots.filter((s) => s.dayKey === resolved.dateKey);
  }

  // Bare weekday → soonest matching day only (not every Friday)
  if ((WEEKDAYS as readonly string[]).includes(hint)) {
    const resolved = resolveDateKey(hint, timezone);
    if (!resolved) return findSlotsForDay(slots, hint);
    const first = slots.filter((s) => s.dayKey === resolved.dateKey);
    if (first.length) return first;
    return findSlotsForDay(slots, hint);
  }

  return findSlotsForDay(slots, hint);
}

/** Compact calendar digest for the model (includes BOOK ids). */
export async function buildAvailabilityBrief(daysAhead = 10) {
  const slots = await getUpcomingSlots(daysAhead);
  const byDay = new Map<string, FreeSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayKey) || [];
    list.push(slot);
    byDay.set(slot.dayKey, list);
  }

  const source = isGhlCalendarEnabled()
    ? "GoHighLevel calendar (live)"
    : "local schedule file";
  const lines: string[] = [
    `Timezone: America/Los_Angeles. Free sessions are ~30-minute visits. Source: ${source}.`,
    "When a parent asks about upcoming days, offer 2–4 open options from this list only.",
    "Parent email is required before booking — if missing, ask for it before [BOOK:…].",
    "If they confirm a slot and email is known, book with [BOOK:YYYY-MM-DDTHH:mm] using the id in parentheses.",
    "If their time is taken, offer the nearest open alternatives. Never invent slots.",
    "Do not volunteer open slots unless they ask about times/availability or clearly want to book.",
    "",
    "OPEN FREE-SESSION SLOTS:",
  ];

  for (const [day, daySlots] of byDay) {
    const times = daySlots
      .slice(0, 10)
      .map((s) => `${startTimePhrase(s)} (${s.start})`)
      .join(", ");
    const weekday = daySlots[0]?.label.split(" ")[0] || "";
    lines.push(
      `- ${weekday} ${day}: ${times}${daySlots.length > 10 ? ", …" : ""}`,
    );
  }

  if (!byDay.size) {
    lines.push("- No generated open slots. Direct them to book online or call.");
  }

  return { brief: lines.join("\n"), slots };
}

/**
 * Server-side calendar answer so demo mode (and the model) always get real opens.
 */
export async function answerAvailabilityQuestion(
  userText: string,
  daysAhead = 14,
  opts?: { excludeStarts?: string[] },
): Promise<{
  reply: string;
  matches: FreeSlot[];
  exact: FreeSlot[];
  hasMore: boolean;
}> {
  const config = await loadScheduleConfig();
  const moreOptions = isMoreOptionsRequest(userText);
  const exclude = new Set(opts?.excludeStarts ?? []);
  const resolved = moreOptions
    ? null
    : resolveDateKey(userText, config.timezone);

  // Pull far enough ahead for dates like "Sept 1"
  let window = daysAhead;
  if (resolved) {
    const now = zonedParts(new Date(), config.timezone);
    const [y, m, d] = resolved.dateKey.split("-").map(Number);
    const diffDays = Math.ceil(
      (Date.UTC(y, m - 1, d) - Date.UTC(now.year, now.month - 1, now.day)) /
        (24 * 60 * 60 * 1000),
    );
    window = Math.max(daysAhead, Math.min(90, diffDays + 3));
  }

  const slots = await getUpcomingSlots(window);
  const remainingAll = slots.filter((s) => !exclude.has(s.start));
  const { dayHint, dateLabel, timeHint, timeMinutes } = moreOptions
    ? { dayHint: "", dateLabel: "", timeHint: "", timeMinutes: null as number | null }
    : extractDayTimeHints(userText, config.timezone);
  const daySlots = resolveRelativeDay(dayHint, config.timezone, remainingAll);
  const focusLabel = dateLabel || dayHint;
  const batchSize = moreOptions ? 4 : 6;

  let exact: FreeSlot[] = [];
  if (timeMinutes != null) {
    exact = daySlots.filter((s) => {
      const hm = s.start.split("T")[1];
      if (!hm) return false;
      const [h, m] = hm.split(":").map(Number);
      return h * 60 + m === timeMinutes;
    });
  } else if (timeHint) {
    const compact = timeHint.toLowerCase().replace(/\s+/g, "");
    exact = daySlots.filter((s) => {
      const startBit = startTimePhrase(s).toLowerCase().replace(/\s+/g, "");
      return startBit.includes(compact) || compact.includes(startBit);
    });
  }

  const pool = dayHint ? daySlots : remainingAll;
  const matches = (exact.length ? exact : pool).slice(0, batchSize);
  const leftover = (exact.length ? remainingAll : pool).filter(
    (s) => !matches.some((m) => m.start === s.start),
  );
  const hasMore = leftover.length > 0;

  if (!slots.length) {
    return {
      reply: `I don't see open trial slots on the calendar right now — you can also book online or call us.`,
      matches: [],
      exact: [],
      hasMore: false,
    };
  }

  if (moreOptions && !matches.length) {
    return {
      reply: `Those were the open trial times I have on the calendar right now. You can also book online or call us.`,
      matches: [],
      exact: [],
      hasMore: false,
    };
  }

  if (dayHint && !daySlots.length) {
    const alts = remainingAll
      .slice(0, 4)
      .map((s) => `${s.label.split(" ")[0]} ${s.dayKey} ${startTimePhrase(s)}`);
    return {
      reply: `I don't have open trial times for ${focusLabel}. Closest opens: ${alts.join("; ")}.`,
      matches: remainingAll.slice(0, 4),
      exact: [],
      hasMore: remainingAll.length > 4,
    };
  }

  if (timeHint && exact.length) {
    const hit = exact[0];
    return {
      reply: `Yes — ${hit.label} is open on our calendar. I can hold it if you'd like.`,
      matches: exact.slice(0, 4),
      exact,
      hasMore,
    };
  }

  if (timeHint && !exact.length) {
    const alts = (dayHint ? daySlots : remainingAll).slice(0, 4);
    const dayBit = focusLabel ? ` on ${focusLabel}` : "";
    return {
      reply: `${timeHint}${dayBit} isn't open. Nearby opens: ${alts.map((s) => startTimePhrase(s)).join(", ")}.`,
      matches: alts,
      exact: [],
      hasMore: (dayHint ? daySlots : remainingAll).length > 4,
    };
  }

  const byDay = new Map<string, FreeSlot[]>();
  for (const slot of matches) {
    const list = byDay.get(slot.dayKey) || [];
    if (list.length < 3) list.push(slot);
    byDay.set(slot.dayKey, list);
  }
  const chunks: string[] = [];
  for (const [dayKey, dayList] of byDay) {
    const weekday = dayList[0].label.split(" ")[0];
    const times = dayList.map((s) => startTimePhrase(s)).join(", ");
    chunks.push(`${weekday} ${dayKey} ${times}`);
  }

  const focus = moreOptions
    ? ""
    : focusLabel
      ? ` on ${focusLabel}`
      : " this week";
  return {
    reply: moreOptions
      ? `More open trial times: ${chunks.join("; ")}.`
      : `Open trial times${focus}: ${chunks.join("; ")}.`,
    matches,
    exact: [],
    hasMore,
  };
}
