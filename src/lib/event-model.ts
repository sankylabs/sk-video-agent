export const EVENT_TIME_ZONE = "America/Los_Angeles";

export type EventStatus = "draft" | "published";

export type AcademyEvent = {
  id: string;
  title: string;
  description: string;
  costCents: number;
  /** ISO timestamp. */
  startsAt: string;
  /** ISO timestamp. */
  endsAt: string;
  /** Child spots. Null means no limit. Each child uses one spot. */
  capacity: number | null;
  status: EventStatus;
  /** Basename inside .data/posters. */
  posterFile?: string;
  createdAt: string;
  updatedAt: string;
};

export type EventKid = {
  name: string;
  age: number;
};

export type EventRegistration = {
  id: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  kids: EventKid[];
  createdAt: string;
};

export type PublicEvent = {
  id: string;
  title: string;
  description: string;
  costCents: number;
  costLabel: string;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  past: boolean;
  capacity: number | null;
  spotsTaken: number;
  soldOut: boolean;
  posterUrl: string;
};

export type RegistrationView = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  kids: EventKid[];
  createdAt: string;
  submittedLabel: string;
};

export type DirectorEventView = PublicEvent & {
  status: EventStatus;
  costInput: string;
  capacityInput: string;
  date: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  registrations: RegistrationView[];
};

export const DIRECTOR_PAGE_SIZE = 15;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const stampFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

function zoneParts(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  let hour = pick("hour");
  if (hour === "24") hour = "00";
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
  };
}

function zoneOffsetMs(instant: Date) {
  const parts = zoneParts(instant);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

export function pacificLocalToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = zoneOffsetMs(new Date(utcGuess));
  let utc = utcGuess - offset;
  const offsetAfter = zoneOffsetMs(new Date(utc));
  if (offsetAfter !== offset) utc = utcGuess - offsetAfter;
  return new Date(utc);
}

export function pacificParts(iso: string) {
  const parts = zoneParts(new Date(iso));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function addUtcDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function clockMatches(iso: string, date: string, time: string) {
  const parts = pacificParts(iso);
  return parts.date === date && parts.time === time;
}

export function pacificRangeToIso(
  date: string,
  startTime: string,
  endTime: string,
  endsNextDay: boolean,
): { startsAt: string; endsAt: string } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Enter a valid date." };
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: "Enter a start and end time." };
  }
  if (!endsNextDay && endTime <= startTime) {
    return {
      error: "End time must be after the start time, or mark that it ends the next day.",
    };
  }
  const endDate = endsNextDay ? addUtcDays(date, 1) : date;
  const startsAt = pacificLocalToUtc(date, startTime).toISOString();
  const endsAt = pacificLocalToUtc(endDate, endTime).toISOString();
  if (!clockMatches(startsAt, date, startTime) || !clockMatches(endsAt, endDate, endTime)) {
    return { error: "That date or time isn’t valid in Pacific time." };
  }
  const span = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (span < 15 * 60 * 1000) {
    return { error: "Events need at least 15 minutes." };
  }
  if (span > 36 * 60 * 60 * 1000) {
    return { error: "Events can run at most 36 hours." };
  }
  return { startsAt, endsAt };
}

export function formatCost(costCents: number) {
  if (costCents <= 0) return "Free";
  const dollars = costCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function centsToDollarInput(costCents: number) {
  return (costCents / 100).toFixed(2).replace(/\.00$/, "");
}

export function dollarsToCents(raw: string) {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [dollars, cents = ""] = value.split(".");
  const cost = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (cost > 999_999) return null;
  return cost;
}

export function formatEventSchedule(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startDay = pacificParts(startsAt).date;
  const endDay = pacificParts(endsAt).date;
  const dateLabel =
    startDay === endDay
      ? dateFmt.format(start)
      : `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
  const timeLabel = `${timeFmt.format(start)} – ${timeFmt.format(end)} PT`;
  return { dateLabel, timeLabel };
}

export function formatSubmitted(iso: string) {
  return `${stampFmt.format(new Date(iso))} PT`;
}

export function isPastEvent(event: Pick<AcademyEvent, "endsAt">, now = new Date()) {
  return new Date(event.endsAt).getTime() <= now.getTime();
}

export function spotsTakenFor(
  registrations: Pick<EventRegistration, "eventId" | "kids">[],
  eventId: string,
) {
  return registrations.reduce(
    (sum, registration) =>
      registration.eventId === eventId ? sum + registration.kids.length : sum,
    0,
  );
}

export function isSoldOut(capacity: number | null, taken: number) {
  return capacity != null && taken >= capacity;
}

export function parseCapacity(raw: string): { capacity: number | null } | { error: string } {
  const value = raw.trim();
  if (!value) return { capacity: null };
  if (!/^\d+$/.test(value)) {
    return { error: "Spot limit must be a whole number, or leave it blank for no limit." };
  }
  const spots = Number(value);
  if (spots < 1 || spots > 5000) {
    return { error: "Spot limit must be between 1 and 5,000, or blank for no limit." };
  }
  return { capacity: spots };
}

export function paginate<T>(items: T[], pageRaw: string | undefined) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / DIRECTOR_PAGE_SIZE));
  const requested = Number(pageRaw);
  const page = Number.isInteger(requested) && requested > 0 ? Math.min(pages, requested) : 1;
  const start = (page - 1) * DIRECTOR_PAGE_SIZE;
  return {
    items: items.slice(start, start + DIRECTOR_PAGE_SIZE),
    page,
    pages,
    total,
  };
}

export function toPublicEvent(
  event: AcademyEvent,
  spotsTaken: number,
  now = new Date(),
): PublicEvent {
  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const capacity = event.capacity ?? null;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    costCents: event.costCents,
    costLabel: formatCost(event.costCents),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dateLabel: schedule.dateLabel,
    timeLabel: schedule.timeLabel,
    past: isPastEvent(event, now),
    capacity,
    spotsTaken,
    soldOut: isSoldOut(capacity, spotsTaken),
    posterUrl: `/api/events/poster/${event.id}`,
  };
}

export function toDirectorEvent(
  event: AcademyEvent,
  registrations: EventRegistration[],
  now = new Date(),
): DirectorEventView {
  const start = pacificParts(event.startsAt);
  const end = pacificParts(event.endsAt);
  const taken = spotsTakenFor(registrations, event.id);
  return {
    ...toPublicEvent(event, taken, now),
    status: event.status === "draft" ? "draft" : "published",
    costInput: centsToDollarInput(event.costCents),
    capacityInput: event.capacity == null ? "" : String(event.capacity),
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    endsNextDay: end.date === addUtcDays(start.date, 1),
    registrations: registrations
      .filter((registration) => registration.eventId === event.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((registration) => ({
        id: registration.id,
        firstName: registration.firstName,
        lastName: registration.lastName,
        email: registration.email,
        kids: registration.kids,
        createdAt: registration.createdAt,
        submittedLabel: formatSubmitted(registration.createdAt),
      })),
  };
}

export function splitEvents<T extends { startsAt: string; endsAt: string; past: boolean }>(
  events: T[],
) {
  const upcoming = events
    .filter((event) => !event.past)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events
    .filter((event) => event.past)
    .sort((a, b) => b.endsAt.localeCompare(a.endsAt));
  return { upcoming, past };
}

export function groupDirectorEvents(events: DirectorEventView[]) {
  const byStart = (a: DirectorEventView, b: DirectorEventView) =>
    a.startsAt.localeCompare(b.startsAt);
  const publishedCurrent = events
    .filter((event) => event.status === "published" && !event.past)
    .sort(byStart);
  const drafts = events
    .filter((event) => event.status === "draft")
    .sort((a, b) => {
      if (a.past !== b.past) return a.past ? 1 : -1;
      return byStart(a, b);
    });
  const completed = events
    .filter((event) => event.status === "published" && event.past)
    .sort((a, b) => b.endsAt.localeCompare(a.endsAt));
  return { publishedCurrent, drafts, completed };
}
