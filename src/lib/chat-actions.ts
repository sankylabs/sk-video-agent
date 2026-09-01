export type TimeOption = { start: string; label: string };

const PICK_MARKER_RE = /\[PICK:([^\]]+)\]/;
export const MORE_SLOTS_MARKER = "[MORE_SLOTS]";
export const MORE_OPTIONS_TEXT = "Give me more options";
export const OFFER_REACH_OUT_MARKER = "[OFFER_REACH_OUT]";
export const REACH_OUT_MARKER = "[REACH_OUT]";
export const REACH_OUT_BUTTON = "Have someone reach out to me";

export const VISIBLE_CHIPS = 4;

export const QUICK_QUESTIONS = [
  "What services do you offer?",
  "How does Steamoji work?",
  "What ages do you serve?",
  "Any free session times this week?",
  "Tell me about memberships",
  "What are camps like?",
  "What's VEX Robotics Club?",
  "Do you host birthday parties?",
  "What's a free trial like?",
  "What are your hours?",
  "Where are you located?",
  "How much does it cost?",
  "Can siblings share a trial?",
  "Does a parent stay for the trial?",
] as const;

export function nextQuickQuestions(usedTexts: string[]) {
  const used = new Set(usedTexts.map((t) => t.trim()));
  return QUICK_QUESTIONS.filter((chip) => !used.has(chip)).slice(
    0,
    VISIBLE_CHIPS,
  );
}

export function formatSlotButtonLabel(start: string, fallbackLabel?: string) {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return fallbackLabel || start;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthName = date.toLocaleDateString("en-US", { month: "short" });
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  const time =
    minute === 0
      ? `${h12}${ampm}`
      : `${h12}:${String(minute).padStart(2, "0")}${ampm}`;
  return `${weekday}, ${monthName} ${day} · ${time}`;
}

export function encodeSlotOption(start: string, label: string) {
  return `[SLOT:${start}|${label}]`;
}

export function encodeSlotPick(start: string, label: string) {
  return `${label} [PICK:${start}]`;
}

export function extractSlotOptions(text: string): TimeOption[] {
  const found: TimeOption[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/\[SLOT:([^|\]]+)\|([^\]]+)\]/g)) {
    const start = match[1].trim();
    const label = match[2].trim();
    if (!start || seen.has(start)) continue;
    seen.add(start);
    found.push({ start, label });
  }
  return found;
}

export function extractPickedStart(text: string) {
  return text.match(PICK_MARKER_RE)?.[1]?.trim() || null;
}

export const SPOKEN_HOUR_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon";

export function extractBookMarkers(text: string) {
  return [...text.matchAll(/\[BOOK:([^\]]+)\]/g)].map((m) => m[1].trim());
}

export function extractCancelMarkers(text: string) {
  return [...text.matchAll(/\[CANCEL(?::[^\]]*)?\]/g)].map((m) => m[0]);
}

export function stripBookMarkers(text: string) {
  return text
    .replace(/\s*\[BOOK:[^\]]+\]\s*/g, " ")
    .replace(/\s*\[CANCEL(?::[^\]]*)?\]\s*/g, " ")
    .trim();
}

/** Digit clock ("4pm") or spoken clock ("four PM", "noon", "at four"). */
export function hasSpokenClock(text: string) {
  const t = text.toLowerCase();
  if (/\b\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/.test(t)) return true;
  if (/\bnoon\b/.test(t)) return true;
  const hour = `(${SPOKEN_HOUR_WORD})`;
  if (new RegExp(`\\b${hour}(\\s+o'?clock)?\\s*(a\\.?m\\.?|p\\.?m\\.?)\\b`).test(t)) {
    return true;
  }
  return new RegExp(`\\bat\\s+${hour}(\\s+o'?clock)?\\b`).test(t);
}

export function isRescheduleRequest(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  return /\b(reschedul\w*|move (it|that|my |the |this )?(appointment|trial|session|booking|time)|change (it|that|the time|my time|the appointment)|different time|another time|new time|switch (it|that|the time))\b/.test(
    t,
  );
}

export function isCancelRequest(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (extractCancelMarkers(text).length) return true;
  if (extractPickedStart(text) || extractBookMarkers(text).length) return false;
  // "cancel that and do Friday at 2pm" is a reschedule
  if (hasSpokenClock(t) && /\b(instead|to |for |reschedule|move|change|book|do )\b/.test(t)) {
    return false;
  }
  if (/\bif you (need|want|have) to cancel\b/.test(t)) return false;
  return (
    /\bcancel(l?ing)?\b/.test(t) ||
    /\b(call (it|that) off|call off (my |the )?(appointment|trial|session))\b/.test(t)
  );
}

/** Maya said she took the appointment off the calendar. */
export function claimsCalendarCancel(text: string) {
  if (/\bif you (need|want|have) to cancel\b/i.test(text)) return false;
  return /\b(i('ve| have)? cancelled|it'?s cancelled|i cancelled (your|the)|took (that|it|you) off (the|our) calendar|removed (that|it|your (trial|appointment)) (from|off))\b/i.test(
    text,
  );
}

/** Maya claimed the slot is already on the calendar (not merely listing times). */
export function claimsCalendarBooking(text: string) {
  return /\b(i('ve| have)? reserved|i('ve| have)? booked|it'?s reserved|it'?s booked|put (that|this|you) on (the|our) calendar|i('ve| have) you down|got you down|booked you|scheduled you|i'll hold (that|it))\b/i.test(
    text,
  );
}

/** Opening recap of an appointment that already exists — do not treat as a new book. */
export function isExistingBookingRecap(text: string) {
  return (
    /nice to see you again/i.test(text) ||
    /you'?re all set for the free trial/i.test(text) ||
    /your last trial was/i.test(text) ||
    /anything you'?d like to go over before then/i.test(text)
  );
}

/**
 * Parent is choosing a trial time (not asking what is open).
 * Used so video/chat can write GHL without waiting for a [BOOK:] tag.
 */
export function isSlotConfirmation(text: string) {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (extractPickedStart(text) || extractBookMarkers(text).length) return true;
  const asking =
    /^(what|which|when|how|do you|can you|are there|is there|any)\b/.test(t) ||
    /\b(what times?|which times?|any (times?|slots?)|available|availability|what'?s open|openings)\b/.test(
      t,
    );
  if (
    asking &&
    !/\b(book|reserve|confirm|schedule|sign me up|i'?ll take)\b/.test(t)
  ) {
    return false;
  }
  if (
    /\b(book|reserve|that works|sounds good|i'?ll take|let'?s? do( it| that)?|see you then|put me down|sign me up|that one|go ahead|schedule me)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    isRescheduleRequest(t) &&
    (hasSpokenClock(t) ||
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/.test(
        t,
      ))
  ) {
    return true;
  }
  return hasSpokenClock(t);
}

export function isMoreOptionsRequest(text: string) {
  const t = text.toLowerCase().trim();
  return (
    t === MORE_OPTIONS_TEXT.toLowerCase() ||
    /\b(give me |show me |any )more (options|times|slots)\b/.test(t) ||
    /\bmore (times|slots)\b/.test(t)
  );
}

export function collectShownSlotStarts(
  messages: { role: string; content: string }[],
) {
  const starts = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const slot of extractSlotOptions(m.content)) {
      starts.add(slot.start);
    }
  }
  return [...starts];
}

export function encodeReachOutPick() {
  return `${REACH_OUT_BUTTON} ${REACH_OUT_MARKER}`;
}

export function stripChatMarkers(text: string) {
  return text
    .replaceAll("[SERVICES_IMAGE]", "")
    .replaceAll(MORE_SLOTS_MARKER, "")
    .replaceAll(OFFER_REACH_OUT_MARKER, "")
    .replaceAll(REACH_OUT_MARKER, "")
    .replace(/\[SLOT:[^\]]+\]/g, "")
    .replace(/\[PICK:[^\]]+\]/g, "")
    .replace(/\[BOOK:[^\]]+\]/g, "")
    .replace(/\[CANCEL(?::[^\]]*)?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ensureOfferReachOutMarker(text: string) {
  if (text.includes(OFFER_REACH_OUT_MARKER)) return text;
  return `${text.trim()}\n${OFFER_REACH_OUT_MARKER}`;
}

export function ensureMoreSlotsMarker(text: string, hasMore: boolean) {
  const cleaned = text.replaceAll(MORE_SLOTS_MARKER, "").trim();
  if (!hasMore) return cleaned;
  return `${cleaned}\n${MORE_SLOTS_MARKER}`;
}

export function ensureSlotMarkers(
  text: string,
  offered: { start: string; label?: string }[],
) {
  if (!offered.length) return text;
  const existing = new Set(extractSlotOptions(text).map((s) => s.start));
  const extra = offered
    .filter((s) => s.start && !existing.has(s.start))
    .slice(0, 6);
  if (!extra.length) return text;
  const markers = extra
    .map((s) =>
      encodeSlotOption(
        s.start,
        formatSlotButtonLabel(s.start, s.label),
      ),
    )
    .join("\n");
  return `${text.trim()}\n${markers}`;
}

export function slotsOfferedInText(
  text: string,
  slots: { start: string; label: string }[],
) {
  const t = text.toLowerCase();
  const hits: { start: string; label: string }[] = [];
  for (const slot of slots) {
    const weekday = slot.label.split(" ")[0]?.toLowerCase() || "";
    const timeBit =
      slot.label.split(" ").slice(2).join(" ").split("–")[0]?.toLowerCase() ||
      "";
    if (!timeBit) continue;
    const hasTime = t.replace(/\s+/g, "").includes(timeBit.replace(/\s+/g, ""));
    const hasDay = (weekday && t.includes(weekday)) || t.includes(slot.start.slice(0, 10));
    if (hasTime && hasDay) hits.push(slot);
    if (hits.length >= 6) break;
  }
  return hits;
}
