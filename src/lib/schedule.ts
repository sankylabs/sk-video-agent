import { promises as fs } from "fs";
import path from "path";

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
  start: string;
  end: string;
  label: string;
  dayKey: string;
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

export async function getUpcomingSlots(daysAhead = 14): Promise<FreeSlot[]> {
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

export async function buildAvailabilityBrief(daysAhead = 10) {
  const slots = await getUpcomingSlots(daysAhead);
  const byDay = new Map<string, FreeSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayKey) || [];
    list.push(slot);
    byDay.set(slot.dayKey, list);
  }

  const lines: string[] = [
    `Timezone: America/Los_Angeles. Free sessions are ${60}-minute visits during academy hours.`,
    "When a parent asks about upcoming days, offer 2–4 open options. Ask their preferred day/time, then confirm if that slot is open.",
    "If their time is taken, offer the nearest open alternatives. Do not invent slots outside this list.",
    "",
    "OPEN FREE-SESSION SLOTS:",
  ];

  for (const [day, daySlots] of byDay) {
    const times = daySlots
      .slice(0, 8)
      .map((s) => s.label.split(" ").slice(2).join(" "))
      .join(", ");
    const weekday = daySlots[0]?.label.split(" ")[0] || "";
    lines.push(`- ${weekday} ${day}: ${times}${daySlots.length > 8 ? ", …" : ""}`);
  }

  if (!byDay.size) {
    lines.push("- No generated open slots. Direct them to book online or call.");
  }

  return { brief: lines.join("\n"), slots };
}
