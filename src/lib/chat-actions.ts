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
