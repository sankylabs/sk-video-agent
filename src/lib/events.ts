import { nanoid } from "nanoid";
import { promises as fs } from "fs";
import path from "path";
import {
  dollarsToCents,
  isPastEvent,
  isSoldOut,
  pacificRangeToIso,
  parseCapacity,
  spotsTakenFor,
  toDirectorEvent,
  toPublicEvent,
  type AcademyEvent,
  type DirectorEventView,
  type EventRegistration,
  type EventStatus,
  type PublicEvent,
} from "./event-model";

const dataDir = path.join(process.cwd(), ".data");
const eventsFile = path.join(dataDir, "events.json");
const registrationsFile = path.join(dataDir, "registrations.json");
const postersDir = path.join(dataDir, "posters");

const POSTER_TYPES: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class EventInputError extends Error {}

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function atomicWrite(file: string, data: unknown) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLines(text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function seedPosterSvg(input: {
  kicker: string;
  title: string;
  when: string;
  accent: string;
  ink: string;
}) {
  const lines = wrapLines(input.title, 16);
  const titleSvg = lines
    .map((line, index) => {
      const size = lines.length > 3 ? 54 : 64;
      const y = 390 + index * (size + 12);
      return `<text x="72" y="${y}" fill="#ffffff" font-family="Trebuchet MS, Avenir Next, sans-serif" font-size="${size}" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="800" height="1000" fill="${input.ink}"/>
  <rect x="36" y="36" width="728" height="928" fill="none" stroke="${input.accent}" stroke-width="10"/>
  <text x="72" y="140" fill="${input.accent}" font-family="Trebuchet MS, Avenir Next, sans-serif" font-size="28" font-weight="800" letter-spacing="4">STEAMOJI KIRKLAND</text>
  <text x="72" y="210" fill="${input.accent}" font-family="Trebuchet MS, Avenir Next, sans-serif" font-size="26" font-weight="700">${escapeXml(input.kicker)}</text>
  ${titleSvg}
  <text x="72" y="860" fill="#ffffff" font-family="Trebuchet MS, Avenir Next, sans-serif" font-size="32" font-weight="700">${escapeXml(input.when)}</text>
</svg>`;
}

const SEED_EVENTS: Array<Omit<AcademyEvent, "posterFile" | "createdAt" | "updatedAt"> & {
  poster: { kicker: string; when: string; accent: string; ink: string };
}> = [
  {
    id: "seed-family-maker",
    title: "Family Maker Morning",
    description:
      "Spend a Saturday morning in the makerspace with your child. Families build a small kinetic sculpture together, then take it home. Best for ages 5–12. Snacks included.",
    costCents: 2500,
    capacity: null,
    allowChildren: true,
    status: "published",
    startsAt: "2026-11-07T18:00:00.000Z",
    endsAt: "2026-11-07T20:30:00.000Z",
    poster: {
      kicker: "HANDS-ON WITH A PARENT",
      when: "Sat, Nov 7 · 10:00 AM",
      accent: "#f9ce47",
      ink: "#272262",
    },
  },
  {
    id: "seed-robotics-showcase",
    title: "Robotics Showcase",
    description:
      "Students demo the robots they have been building, then visitors try a short drive-and-code challenge. Come watch, cheer, and see what a session at Steamoji feels like. Ages 6–14.",
    costCents: 0,
    capacity: null,
    allowChildren: true,
    status: "published",
    startsAt: "2026-11-21T21:00:00.000Z",
    endsAt: "2026-11-22T00:00:00.000Z",
    poster: {
      kicker: "STUDENT DEMOS",
      when: "Sat, Nov 21 · 1:00 PM",
      accent: "#e9963e",
      ink: "#1e2060",
    },
  },
  {
    id: "seed-spring-open-house",
    title: "Spring Open House",
    description:
      "Neighbors toured the Kirkland academy, met mentors, and tried a mini build station. A look at how families get started with a free session.",
    costCents: 0,
    capacity: null,
    allowChildren: true,
    status: "published",
    startsAt: "2026-09-12T17:00:00.000Z",
    endsAt: "2026-09-12T20:00:00.000Z",
    poster: {
      kicker: "ACADEMY TOUR",
      when: "Sat, Sep 12 · 10:00 AM",
      accent: "#faeea0",
      ink: "#1a1b3a",
    },
  },
];

async function writeSeedPosters() {
  await fs.mkdir(postersDir, { recursive: true });
  await Promise.all(
    SEED_EVENTS.map((event) =>
      fs.writeFile(
        path.join(postersDir, `${event.id}.svg`),
        seedPosterSvg({
          kicker: event.poster.kicker,
          title: event.title,
          when: event.poster.when,
          accent: event.poster.accent,
          ink: event.poster.ink,
        }),
        "utf8",
      ),
    ),
  );
}

function seedRecords(nowIso: string): AcademyEvent[] {
  return SEED_EVENTS.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    costCents: event.costCents,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    posterFile: `${event.id}.svg`,
    capacity: null,
    allowChildren: true,
    status: "published",
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

function normalizeEvent(event: Partial<AcademyEvent>): AcademyEvent | null {
  if (!event.id || !event.startsAt || !event.endsAt) return null;
  const capacity =
    typeof event.capacity === "number" && event.capacity >= 1
      ? Math.floor(event.capacity)
      : null;
  return {
    id: event.id,
    title: event.title || "Untitled event",
    description: event.description || "",
    costCents: event.costCents ?? 0,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity,
    allowChildren: event.allowChildren !== false,
    status: event.status === "draft" ? "draft" : "published",
    posterFile: event.posterFile,
    createdAt: event.createdAt || event.startsAt,
    updatedAt: event.updatedAt || event.createdAt || event.startsAt,
  };
}

async function readEventsUnlocked(): Promise<AcademyEvent[]> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(eventsFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<AcademyEvent>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((event) => {
      const normalized = normalizeEvent(event);
      return normalized ? [normalized] : [];
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") return [];
    const nowIso = new Date().toISOString();
    const seeded = seedRecords(nowIso);
    await writeSeedPosters();
    await atomicWrite(eventsFile, seeded);
    return seeded;
  }
}

/** One-time production clear of test signups for Just for Moms. Remove after it has run. */
const TEST_REGISTRATION_EVENT_ID = "w-cj4EJWk7";

async function readRegistrationsUnlocked(): Promise<EventRegistration[]> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(registrationsFile, "utf8");
    const parsed = JSON.parse(raw) as EventRegistration[];
    if (!Array.isArray(parsed)) return [];
    const kept = parsed.filter(
      (registration) => registration?.eventId !== TEST_REGISTRATION_EVENT_ID,
    );
    if (kept.length !== parsed.length) {
      await atomicWrite(registrationsFile, kept);
      console.log(
        `[events] removed ${parsed.length - kept.length} registration(s) for ${TEST_REGISTRATION_EVENT_ID}`,
      );
    }
    return kept;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") return [];
    await atomicWrite(registrationsFile, []);
    return [];
  }
}

function posterPath(filename: string) {
  const safe = path.basename(filename);
  return path.join(postersDir, safe);
}

function looksLikeImage(buf: Buffer, ext: "jpg" | "png" | "webp") {
  if (ext === "jpg") return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === "png") {
    return (
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  return (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

async function removePoster(filename?: string) {
  if (!filename) return;
  await fs.unlink(posterPath(filename)).catch(() => undefined);
}

export async function savePoster(eventId: string, file: Blob) {
  const type = "type" in file ? file.type : "";
  const ext = POSTER_TYPES[type];
  if (!ext) {
    throw new EventInputError("Poster must be a JPG, PNG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new EventInputError("Poster must be 5 MB or smaller.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(bytes, ext)) {
    throw new EventInputError("That file doesn’t look like a JPG, PNG, or WebP image.");
  }
  await fs.mkdir(postersDir, { recursive: true });
  const filename = `${eventId}.${ext}`;
  await fs.writeFile(posterPath(filename), bytes);
  return filename;
}

export function readPosterUpload(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string" || value.size === 0) return null;
  return value;
}

export function readEventForm(form: FormData) {
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const costRaw = String(form.get("cost") ?? "").trim();
  const date = String(form.get("date") || "").trim();
  const startTime = String(form.get("startTime") || "").trim();
  const endTime = String(form.get("endTime") || "").trim();
  const endsNextDay = String(form.get("endsNextDay") || "") === "yes";
  if (title.length < 1 || title.length > 120) {
    throw new EventInputError("Title needs 1–120 characters.");
  }
  if (description.length < 1 || description.length > 4000) {
    throw new EventInputError("Description needs 1–4,000 characters.");
  }
  const costCents = dollarsToCents(costRaw);
  if (costCents == null) {
    throw new EventInputError("Cost must be a dollar amount like 0, 25, or 25.50.");
  }
  const range = pacificRangeToIso(date, startTime, endTime, endsNextDay);
  if ("error" in range) throw new EventInputError(range.error);
  const capacityRaw = form.get("capacity");
  const capacityProvided = typeof capacityRaw === "string";
  const parsedCapacity = parseCapacity(capacityProvided ? capacityRaw : "");
  if ("error" in parsedCapacity) throw new EventInputError(parsedCapacity.error);
  const intent = String(form.get("intent") || "");
  if (intent !== "draft" && intent !== "publish") {
    throw new EventInputError("Choose save draft or publish.");
  }
  const status: EventStatus = intent === "publish" ? "published" : "draft";
  return {
    title,
    description,
    costCents,
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    capacity: parsedCapacity.capacity,
    capacityProvided,
    allowChildren: String(form.get("allowChildren") || "") === "yes",
    status,
    poster: readPosterUpload(form.get("poster")),
  };
}

function capacityForUpdate(
  current: AcademyEvent,
  input: { endsAt: string; capacity: number | null; capacityProvided: boolean },
) {
  const endedBefore = isPastEvent(current);
  const endedAfter = isPastEvent({ endsAt: input.endsAt });
  if (!endedBefore || !endedAfter) return input.capacity;
  if (input.capacityProvided && input.capacity !== current.capacity) {
    throw new EventInputError("The spot limit is locked because this event has ended.");
  }
  return current.capacity;
}

export async function listPublicEvents(now = new Date()): Promise<PublicEvent[]> {
  return withLock(async () => {
    const [events, registrations] = await Promise.all([
      readEventsUnlocked(),
      readRegistrationsUnlocked(),
    ]);
    return events
      .filter((event) => event.status === "published")
      .map((event) =>
        toPublicEvent(event, spotsTakenFor(registrations, event.id, event.allowChildren), now),
      );
  });
}

export async function getPublicEvent(id: string, now = new Date()) {
  return withLock(async () => {
    const [events, registrations] = await Promise.all([
      readEventsUnlocked(),
      readRegistrationsUnlocked(),
    ]);
    const event = events.find((item) => item.id === id);
    if (!event || event.status !== "published") return null;
    return toPublicEvent(
      event,
      spotsTakenFor(registrations, event.id, event.allowChildren),
      now,
    );
  });
}

export async function getDirectorEvent(id: string, now = new Date()) {
  const events = await listDirectorEvents(now);
  return events.find((event) => event.id === id) ?? null;
}

export async function listDirectorEvents(now = new Date()): Promise<DirectorEventView[]> {
  return withLock(async () => {
    const [events, registrations] = await Promise.all([
      readEventsUnlocked(),
      readRegistrationsUnlocked(),
    ]);
    return events
      .map((event) => toDirectorEvent(event, registrations, now))
      .sort((a, b) => {
        if (a.past !== b.past) return a.past ? 1 : -1;
        return a.past
          ? b.endsAt.localeCompare(a.endsAt)
          : a.startsAt.localeCompare(b.startsAt);
      });
  });
}

export async function getPosterFile(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const events = await withLock(readEventsUnlocked);
  const event = events.find((item) => item.id === id);
  if (!event?.posterFile) return null;
  const filePath = posterPath(event.posterFile);
  try {
    const bytes = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".svg"
            ? "image/svg+xml"
            : "image/jpeg";
    return { bytes, type };
  } catch {
    return null;
  }
}

export async function createEvent(form: FormData) {
  const input = readEventForm(form);
  if (!input.poster) throw new EventInputError("Add a poster image.");
  return withLock(async () => {
    const events = await readEventsUnlocked();
    const id = nanoid(10);
    const posterFile = await savePoster(id, input.poster!);
    const nowIso = new Date().toISOString();
    const event: AcademyEvent = {
      id,
      title: input.title,
      description: input.description,
      costCents: input.costCents,
      capacity: input.capacity,
      allowChildren: input.allowChildren,
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      posterFile,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    events.push(event);
    await atomicWrite(eventsFile, events);
    return toDirectorEvent(event, [], new Date());
  });
}

export async function updateEvent(id: string, form: FormData) {
  const input = readEventForm(form);
  return withLock(async () => {
    const events = await readEventsUnlocked();
    const index = events.findIndex((event) => event.id === id);
    if (index < 0) return null;
    const current = events[index];
    let posterFile = current.posterFile;
    if (input.poster) {
      const nextPoster = await savePoster(id, input.poster);
      if (posterFile && posterFile !== nextPoster) await removePoster(posterFile);
      posterFile = nextPoster;
    }
    const event: AcademyEvent = {
      ...current,
      title: input.title,
      description: input.description,
      costCents: input.costCents,
      capacity: capacityForUpdate(current, input),
      allowChildren: input.allowChildren,
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      posterFile,
      updatedAt: new Date().toISOString(),
    };
    events[index] = event;
    await atomicWrite(eventsFile, events);
    const registrations = await readRegistrationsUnlocked();
    return toDirectorEvent(event, registrations, new Date());
  });
}

export async function deleteEvent(id: string) {
  return withLock(async () => {
    const events = await readEventsUnlocked();
    const event = events.find((item) => item.id === id);
    if (!event) return false;
    await atomicWrite(
      eventsFile,
      events.filter((item) => item.id !== id),
    );
    const registrations = await readRegistrationsUnlocked();
    await atomicWrite(
      registrationsFile,
      registrations.filter((item) => item.eventId !== id),
    );
    await removePoster(event.posterFile);
    return true;
  });
}

export async function registerForEvent(
  eventId: string,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    kirklandResident: boolean;
    residence?: string;
    kids: { name: string; age: number }[];
  },
) {
  return withLock(async () => {
    const events = await readEventsUnlocked();
    const event = events.find((item) => item.id === eventId);
    if (!event || event.status !== "published") {
      return { error: "That event is no longer listed.", status: 404 as const };
    }
    if (isPastEvent(event)) {
      return { error: "Registration is closed for this event.", status: 409 as const };
    }
    const residence = input.kirklandResident ? "" : (input.residence || "").trim();
    if (!input.kirklandResident && !residence) {
      return { error: "Tell us where you reside.", status: 400 as const };
    }
    if (residence.length > 120) {
      return { error: "Where you reside needs 120 characters or fewer.", status: 400 as const };
    }
    if (event.allowChildren && input.kids.length < 1) {
      return {
        error: "Add each child’s name and an age from 1 to 18.",
        status: 400 as const,
      };
    }
    if (!event.allowChildren && input.kids.length > 0) {
      return { error: "This event does not register children.", status: 400 as const };
    }
    const kids = event.allowChildren ? input.kids : [];
    const registrations = await readRegistrationsUnlocked();
    if (event.capacity != null) {
      const taken = spotsTakenFor(registrations, event.id, event.allowChildren);
      const incoming = event.allowChildren ? kids.length : 1;
      if (isSoldOut(event.capacity, taken)) {
        return { error: "This event is sold out.", status: 409 as const };
      }
      if (taken + incoming > event.capacity) {
        const left = event.capacity - taken;
        return {
          error: left === 1 ? "Only 1 spot is left." : `Only ${left} spots are left.`,
          status: 409 as const,
        };
      }
    }
    const registration: EventRegistration = {
      id: nanoid(10),
      eventId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      kirklandResident: input.kirklandResident,
      ...(residence ? { residence } : {}),
      kids,
      createdAt: new Date().toISOString(),
    };
    registrations.push(registration);
    await atomicWrite(registrationsFile, registrations);
    return { registration, event };
  });
}
