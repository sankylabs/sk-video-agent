import { promises as fs } from "fs";
import path from "path";
import { siteConfig } from "./config";
import { formatEventSchedule, type EventKid, type EventRegistration } from "./event-model";
import { getGhlConfig, sendGhlEmail, upsertGhlContact } from "./ghl";
import { sendSms } from "./sms";

const EVENT_ID = "YueALiAdWG";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "steamoween-dayof.json");
const lockFile = path.join(dataDir, "steamoween-dayof.lock");

export const STEAM_O_WEEN_SMS = [
  "🎃 Happy Halloween from Steamoji Kirkland! 👻",
  "We're excited to welcome your child to our STEAM-O-WEEN 3D Design Workshop today at 1:30 PM! Get ready for some spooky, creative fun! 🕸️🎨",
  "See you soon! 🎃",
].join("\n");

type Marker = { sms?: string[]; email?: string[] };

export function usablePhone(raw: string | undefined) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function textToHtml(text: string) {
  const blocks = text
    .split("\n")
    .map((line) =>
      line
        ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#1e2060;">${escapeHtml(line)}</p>`
        : "",
    )
    .join("");
  return `<div style="font-family:Georgia,serif;max-width:560px;">${blocks}</div>`;
}

function pacificDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function startTimeLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function childrenLine(kids: EventKid[]) {
  if (!kids.length) return "";
  return `Coming with you: ${kids.map((kid) => `${kid.name}, age ${kid.age}`).join("; ")}`;
}

export type DayOfParent = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  kids: EventKid[];
};

/** One parent per email. A usable phone gets a text. Otherwise they get email. */
export function planDayOfParents(registrations: EventRegistration[]): DayOfParent[] {
  const groups = new Map<string, EventRegistration[]>();
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID) continue;
    const email = registration.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const list = groups.get(email) || [];
    list.push(registration);
    groups.set(email, list);
  }
  const parents: DayOfParent[] = [];
  for (const [email, list] of groups) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = list[list.length - 1];
    let phone: string | null = null;
    for (const registration of [...list].reverse()) {
      phone = usablePhone(registration.phone);
      if (phone) break;
    }
    const kids: EventKid[] = [];
    const seen = new Set<string>();
    for (const registration of list) {
      for (const kid of registration.kids || []) {
        const key = `${kid.name.trim().toLowerCase()}|${kid.age}`;
        if (seen.has(key)) continue;
        seen.add(key);
        kids.push(kid);
      }
    }
    parents.push({
      email,
      firstName: latest.firstName.trim(),
      lastName: latest.lastName.trim(),
      phone,
      kids,
    });
  }
  return parents;
}

export function buildTodayReminderEmail(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  parent: Pick<DayOfParent, "firstName" | "kids">;
}) {
  const schedule = formatEventSchedule(input.startsAt, input.endsAt);
  const childLine = childrenLine(input.parent.kids);
  const lines = [
    `Hi ${input.parent.firstName},`,
    "",
    `This is a reminder that you're registered for ${input.title} today.`,
    "",
    schedule.dateLabel,
    schedule.timeLabel,
    siteConfig.address,
    "",
    ...(childLine ? [childLine, ""] : []),
    `We look forward to seeing you. Questions? Call ${siteConfig.phone} or email ${siteConfig.email}.`,
    "",
    siteConfig.brand,
  ];
  const text = lines.join("\n");
  return {
    subject: `Today: ${input.title} at ${startTimeLabel(input.startsAt)}`,
    text,
    html: textToHtml(text),
  };
}

function redact(message: string, parent: DayOfParent) {
  let out = message.replaceAll(parent.email, "recipient");
  if (parent.phone) out = out.replaceAll(parent.phone, "phone");
  return out.replace(/\+?\d[\d\s().-]{8,}\d/g, "phone").slice(0, 240);
}

async function readMarker(): Promise<Required<Marker>> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as Marker;
    return {
      sms: Array.isArray(parsed.sms) ? parsed.sms : [],
      email: Array.isArray(parsed.email) ? parsed.email : [],
    };
  } catch {
    return { sms: [], email: [] };
  }
}

async function writeMarker(marker: Required<Marker>) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify(marker), "utf8");
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

async function sendText(parent: DayOfParent) {
  if (!parent.phone) throw new Error("missing phone");
  const twilio = await sendSms(parent.phone, STEAM_O_WEEN_SMS);
  if (twilio.sent) return "twilio" as const;
  if (!twilio.reason.includes("not configured")) throw new Error(twilio.reason);
  const config = getGhlConfig();
  if (!config) throw new Error("GoHighLevel is not configured");
  const contact = await upsertGhlContact({
    firstName: parent.firstName,
    lastName: parent.lastName,
    name: `${parent.firstName} ${parent.lastName}`.trim(),
    email: parent.email,
    phone: parent.phone,
    requireEmail: true,
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
      message: STEAM_O_WEEN_SMS,
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
  return "ghl" as const;
}

async function sendEmail(parent: DayOfParent, email: { subject: string; text: string; html: string }) {
  const errors: string[] = [];
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const from =
      process.env.MAIL_FROM?.trim() ||
      process.env.RESEND_FROM?.trim() ||
      "Maya <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [parent.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) return "resend" as const;
    errors.push(data.message || `resend ${res.status}`);
  }
  try {
    const contact = await upsertGhlContact({
      firstName: parent.firstName,
      lastName: parent.lastName,
      name: `${parent.firstName} ${parent.lastName}`.trim(),
      email: parent.email,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to: parent.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return "ghl" as const;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }
  throw new Error(errors.join("; ") || "email is not configured");
}

export async function sendSteamOWeenDayOfReminders(now = new Date()) {
  if (!(await claimLock())) return { ok: true as const, sent: "in-progress" as const };
  try {
    const events = JSON.parse(await fs.readFile(path.join(dataDir, "events.json"), "utf8")) as {
      id?: string;
      title?: string;
      startsAt?: string;
      endsAt?: string;
    }[];
    const event = events.find((item) => item.id === EVENT_ID);
    if (!event?.title || !event.startsAt || !event.endsAt) {
      throw new Error("Steam-O-Ween event was not found");
    }
    if (!/steam-o-ween/i.test(event.title)) {
      throw new Error("Event title does not match Steam-O-Ween");
    }
    if (pacificDay(event.startsAt) !== pacificDay(now.toISOString())) {
      throw new Error("Steam-O-Ween is not scheduled today");
    }

    const registrations = JSON.parse(
      await fs.readFile(path.join(dataDir, "registrations.json"), "utf8"),
    ) as EventRegistration[];
    const parents = planDayOfParents(registrations);
    const marker = await readMarker();
    const smsDone = new Set(marker.sms);
    const emailDone = new Set(marker.email.map((email) => email.toLowerCase()));
    let smsSent = 0;
    let emailed = 0;
    let already = 0;
    let smsFallback = 0;
    const errors: string[] = [];
    const via = new Set<string>();

    for (const parent of parents) {
      if (parent.phone && smsDone.has(parent.phone)) {
        already += 1;
        continue;
      }
      if (!parent.phone && emailDone.has(parent.email)) {
        already += 1;
        continue;
      }

      let smsProblem = "";
      if (parent.phone) {
        try {
          via.add(`sms:${await sendText(parent)}`);
          smsDone.add(parent.phone);
          marker.sms = [...smsDone];
          await writeMarker(marker);
          smsSent += 1;
          continue;
        } catch (err) {
          smsProblem = redact(err instanceof Error ? err.message : "sms failed", parent);
        }
      }

      if (emailDone.has(parent.email)) {
        if (smsProblem) errors.push(smsProblem);
        continue;
      }
      try {
        const email = buildTodayReminderEmail({
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          parent,
        });
        via.add(`email:${await sendEmail(parent, email)}`);
        emailDone.add(parent.email);
        marker.email = [...emailDone];
        await writeMarker(marker);
        emailed += 1;
        if (smsProblem) smsFallback += 1;
      } catch (err) {
        const emailProblem = redact(err instanceof Error ? err.message : "email failed", parent);
        errors.push(smsProblem ? `${smsProblem}; ${emailProblem}` : emailProblem);
      }
    }

    return {
      ok: errors.length === 0,
      parents: parents.length,
      smsSent,
      emailed,
      smsFallback,
      already,
      failed: errors.length,
      errors,
      via: [...via],
    };
  } finally {
    await fs.rm(lockFile, { force: true });
  }
}
