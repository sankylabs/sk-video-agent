import { promises as fs } from "fs";
import path from "path";
import type { EventRegistration } from "./event-model";
import { getGhlConfig, upsertGhlContact } from "./ghl";

const EVENT_ID = "w-cj4EJWk7";
/** 7:30 AM Pacific on Sunday, November 15, 2026. */
export const MOMS_SUNDAY_SMS_AT = new Date("2026-11-15T15:30:00.000Z");
/** Stop after the workshop starts at 10:30 AM Pacific, so a late restart does not text during the event. */
export const MOMS_SUNDAY_SMS_UNTIL = new Date("2026-11-15T18:30:00.000Z");

const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-sunday-sms.json");
const lockFile = path.join(dataDir, "moms-sunday-sms.lock");

let started = false;
let running = false;

export function momsSundaySmsDue(now = new Date()) {
  const time = now.getTime();
  return time >= MOMS_SUNDAY_SMS_AT.getTime() && time < MOMS_SUNDAY_SMS_UNTIL.getTime();
}

function reminder(firstName: string) {
  const name = firstName.trim() || "there";
  return [
    `Good morning ${name}! ☀️💕 Today's the day! We're excited to welcome you to our FREE 3D Design & Printing Workshop for Moms!`,
    "🕥 10:30 AM \u2013 12:00 PM",
    "📍 Steamoji Kirkland, 355 Kirkland Avenue",
    "Lets get Building!",
    "-Team Steamoji Kirkland",
  ].join("\n");
}

function usablePhone(raw: string | undefined) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function publicReason(reason: string) {
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:pit|sk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]")
    .slice(0, 300);
}

type Parent = {
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
};

function parentsFor(registrations: EventRegistration[]) {
  const groups = new Map<string, EventRegistration[]>();
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID) continue;
    const phone = usablePhone(registration.phone);
    if (!phone) continue;
    const list = groups.get(phone) || [];
    list.push(registration);
    groups.set(phone, list);
  }
  const parents: Parent[] = [];
  for (const [phone, list] of groups) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = list[list.length - 1];
    parents.push({
      phone,
      firstName: latest.firstName.trim(),
      lastName: latest.lastName.trim(),
      email: latest.email.trim(),
    });
  }
  return parents;
}

async function readMarker(): Promise<{ sent: Set<string>; complete: boolean }> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as {
      sent?: string[];
      complete?: boolean;
    };
    return { sent: new Set(parsed.sent || []), complete: parsed.complete === true };
  } catch {
    return { sent: new Set(), complete: false };
  }
}

async function writeMarker(sent: Set<string>, complete: boolean) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    markerFile,
    JSON.stringify({ sent: [...sent], complete }),
    "utf8",
  );
}

async function claimLock() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.writeFile(lockFile, new Date().toISOString(), { flag: "wx" });
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
    const stamp = await fs.readFile(lockFile, "utf8").catch(() => "");
    const age = Date.now() - new Date(stamp).getTime();
    if (Number.isFinite(age) && age < 3 * 60 * 1000) return false;
    await fs.writeFile(lockFile, new Date().toISOString(), "utf8");
    return true;
  }
}

async function sendOne(parent: Parent) {
  const config = getGhlConfig();
  if (!config) throw new Error("GoHighLevel is not configured");
  const contact = await upsertGhlContact({
    firstName: parent.firstName,
    lastName: parent.lastName,
    name: `${parent.firstName} ${parent.lastName}`.trim(),
    email: parent.email || undefined,
    phone: parent.phone,
    requireEmail: false,
  });
  const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Version: process.env.GHL_API_VERSION || "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "SMS",
      contactId: contact.contactId,
      message: reminder(parent.firstName),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `GHL ${res.status}`;
    try {
      const data = JSON.parse(text) as { message?: string };
      if (data.message) detail = data.message.slice(0, 300);
    } catch {
      if (text) detail = text.slice(0, 300);
    }
    throw new Error(detail);
  }
}

async function sendMomsSundayTexts() {
  if (running || !momsSundaySmsDue()) return;
  const existing = await readMarker().catch(() => ({ sent: new Set<string>(), complete: false }));
  if (existing.complete) return;
  if (!(await claimLock())) return;
  running = true;
  try {
    const events = JSON.parse(await fs.readFile(path.join(dataDir, "events.json"), "utf8")) as {
      id?: string;
      title?: string;
      startsAt?: string;
    }[];
    const event = events.find((item) => item.id === EVENT_ID);
    if (!event?.title || !/moms/i.test(event.title) || !event.startsAt?.startsWith("2026-11-15")) {
      console.error("[moms-sunday-sms] workshop was not found");
      return;
    }
    const registrations = JSON.parse(
      await fs.readFile(path.join(dataDir, "registrations.json"), "utf8"),
    ) as EventRegistration[];
    const parents = parentsFor(registrations);
    const already = (await readMarker()).sent;
    let sent = 0;
    const errors: string[] = [];
    for (const parent of parents) {
      if (already.has(parent.phone)) continue;
      try {
        await sendOne(parent);
        already.add(parent.phone);
        await writeMarker(already, false);
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        errors.push(publicReason(message.replaceAll(parent.email, "recipient")));
      }
    }
    if (errors.length === 0) await writeMarker(already, true);
    console.log(
      `[moms-sunday-sms] sent ${sent} failed ${errors.length} of ${parents.length}`,
    );
    if (errors.length) console.error("[moms-sunday-sms]", errors.join(" | "));
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    console.error("[moms-sunday-sms]", publicReason(message));
  } finally {
    running = false;
    await fs.rm(lockFile, { force: true });
  }
}

/** Arm the Sunday 7:30 AM Pacific send. Safe to call once when the server starts. */
export function startMomsSundaySms() {
  if (started) return;
  started = true;
  const delay = MOMS_SUNDAY_SMS_AT.getTime() - Date.now();
  if (delay > 0) {
    const timeout = setTimeout(() => {
      void sendMomsSundayTexts();
    }, delay);
    timeout.unref?.();
    console.log("[moms-sunday-sms] scheduled for 7:30 AM Pacific on November 15, 2026");
  }
  const timer = setInterval(() => {
    if (Date.now() >= MOMS_SUNDAY_SMS_UNTIL.getTime()) {
      clearInterval(timer);
      return;
    }
    void sendMomsSundayTexts();
  }, 60_000);
  timer.unref?.();
  if (momsSundaySmsDue()) void sendMomsSundayTexts();
}
