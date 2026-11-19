import { promises as fs } from "fs";
import path from "path";
import { LASER_WORKSHOP_EVENT_ID } from "./event-confirmation-mail";
import type { EventRegistration } from "./event-model";
import { laserFridaySms, usableEventPhone } from "./event-registration-sms";
import { getGhlConfig, upsertGhlContact } from "./ghl";

/** 9:00 AM Pacific on Friday, November 20, 2026. */
export const LASER_FRIDAY_SMS_AT = new Date("2026-11-20T17:00:00.000Z");
/** Stop at midnight Pacific, so a Saturday restart does not say the workshop is tomorrow. */
export const LASER_FRIDAY_SMS_UNTIL = new Date("2026-11-21T08:00:00.000Z");

const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "laser-friday-sms.json");
const lockFile = path.join(dataDir, "laser-friday-sms.lock");

let started = false;
let running = false;

export function laserFridaySmsDue(now = new Date()) {
  const time = now.getTime();
  return time >= LASER_FRIDAY_SMS_AT.getTime() && time < LASER_FRIDAY_SMS_UNTIL.getTime();
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
    if (registration.eventId !== LASER_WORKSHOP_EVENT_ID) continue;
    if (registration.cancelledAt) continue;
    if (registration.smsConsent !== true) continue;
    const phone = usableEventPhone(registration.phone);
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

async function readMarker(): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as { sent?: string[] };
    return new Set(parsed.sent || []);
  } catch {
    return new Set();
  }
}

async function writeMarker(sent: Set<string>) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify({ sent: [...sent] }), "utf8");
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
      message: laserFridaySms(parent.firstName),
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

async function sendLaserFridayTexts() {
  if (running || !laserFridaySmsDue()) return;
  if (!(await claimLock())) return;
  running = true;
  try {
    const events = JSON.parse(await fs.readFile(path.join(dataDir, "events.json"), "utf8")) as {
      id?: string;
      title?: string;
      startsAt?: string;
    }[];
    const event = events.find((item) => item.id === LASER_WORKSHOP_EVENT_ID);
    if (!event?.title || !/laser/i.test(event.title) || !event.startsAt?.startsWith("2026-11-21")) {
      console.error("[laser-friday-sms] workshop was not found");
      return;
    }
    const registrations = JSON.parse(
      await fs.readFile(path.join(dataDir, "registrations.json"), "utf8"),
    ) as EventRegistration[];
    const parents = parentsFor(registrations);
    const already = await readMarker();
    let sent = 0;
    const errors: string[] = [];
    for (const parent of parents) {
      if (already.has(parent.phone)) continue;
      try {
        await sendOne(parent);
        already.add(parent.phone);
        await writeMarker(already);
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        errors.push(publicReason(message.replaceAll(parent.email, "recipient")));
      }
    }
    console.log(`[laser-friday-sms] sent ${sent} failed ${errors.length} of ${parents.length}`);
    if (errors.length) console.error("[laser-friday-sms]", errors.join(" | "));
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    console.error("[laser-friday-sms]", publicReason(message));
  } finally {
    running = false;
    await fs.rm(lockFile, { force: true });
  }
}

/** Arm the Friday 9:00 AM Pacific reminder. Safe to call once when the server starts. */
export function startLaserFridaySms() {
  if (started) return;
  started = true;
  void import("./events")
    .then(({ sendPendingEventConfirmations, sendPendingLaserConfirmationTexts }) =>
      Promise.all([sendPendingEventConfirmations(), sendPendingLaserConfirmationTexts()]),
    )
    .catch((err: unknown) => {
      console.error(
        "[laser-friday-sms] pending confirmation retry failed",
        err instanceof Error ? err.message : err,
      );
    });
  const delay = LASER_FRIDAY_SMS_AT.getTime() - Date.now();
  if (delay > 0) {
    const timeout = setTimeout(() => {
      void sendLaserFridayTexts();
    }, delay);
    timeout.unref?.();
    console.log("[laser-friday-sms] scheduled for 9:00 AM Pacific on November 20, 2026");
  }
  const timer = setInterval(() => {
    if (Date.now() >= LASER_FRIDAY_SMS_UNTIL.getTime()) {
      clearInterval(timer);
      return;
    }
    void sendLaserFridayTexts();
  }, 60_000);
  timer.unref?.();
  if (laserFridaySmsDue()) void sendLaserFridayTexts();
}
