import { promises as fs } from "fs";
import path from "path";
import type { EventRegistration } from "./event-model";
import { getGhlConfig, upsertGhlContact } from "./ghl";

const EVENT_ID = "w-cj4EJWk7";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-sms-sent.json");
const lockFile = path.join(dataDir, "moms-sms-sent.lock");

function reminder(firstName: string) {
  const name = firstName.trim() || "there";
  return [
    `Hi ${name}! 💕 Just a friendly reminder about your FREE 3D Design & Printing Workshop for Moms at Steamoji Kirkland this Sunday, Nov 15, from 10:30 AM–12 PM! 🎨`,
    "We're excited to have you join us! We've also sent you an email with all the details. Please check it out before your visit.",
    "See you Sunday! 😊",
    "",
    "\u2013 Team Steamoji Kirkland",
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

function parentsFor(registrations: EventRegistration[]): { parents: Parent[]; noPhone: number } {
  const groups = new Map<string, EventRegistration[]>();
  let noPhone = 0;
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID) continue;
    const phone = usablePhone(registration.phone);
    if (!phone) {
      noPhone += 1;
      continue;
    }
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
  return { parents, noPhone };
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

export async function sendMomsWorkshopTexts() {
  if (!(await claimLock())) return { ok: true as const, sent: "in-progress" as const };
  try {
    const events = JSON.parse(await fs.readFile(path.join(dataDir, "events.json"), "utf8")) as {
      id?: string;
      title?: string;
      startsAt?: string;
    }[];
    const event = events.find((item) => item.id === EVENT_ID);
    if (!event?.title || !/moms/i.test(event.title)) {
      throw new Error("Just for Moms workshop was not found");
    }
    if (!event.startsAt?.startsWith("2026-11-15")) {
      throw new Error("Workshop date does not match November 15");
    }
    const registrations = JSON.parse(
      await fs.readFile(path.join(dataDir, "registrations.json"), "utf8"),
    ) as EventRegistration[];
    const { parents, noPhone } = parentsFor(registrations);
    const already = await readMarker();
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const parent of parents) {
      if (already.has(parent.phone)) {
        skipped += 1;
        continue;
      }
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
    return {
      ok: errors.length === 0,
      parents: parents.length,
      noPhone,
      sent,
      skipped,
      failed: errors.length,
      errors,
      via: ["ghl"],
    };
  } finally {
    await fs.rm(lockFile, { force: true });
  }
}
