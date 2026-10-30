import { promises as fs } from "fs";
import path from "path";
import { siteConfig } from "./config";
import { formatEventSchedule, type EventRegistration } from "./event-model";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const EVENT_ID = "YueALiAdWG";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "steamoween-reminder-sent.json");

type Marker = { sent?: string[] };

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

function startTimeLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function childrenLine(kids: { name: string; age: number }[]) {
  if (!kids.length) return "";
  return `Coming with you: ${kids.map((kid) => `${kid.name}, age ${kid.age}`).join("; ")}`;
}

async function readMarker(): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as Marker;
    return new Set((parsed.sent || []).map((email) => email.toLowerCase()));
  } catch {
    return new Set();
  }
}

async function writeMarker(sent: Set<string>) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify({ sent: [...sent] }), "utf8");
}

async function sendOne(input: {
  to: string;
  firstName: string;
  lastName: string;
  phone?: string;
  subject: string;
  text: string;
  html: string;
}) {
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
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) return "resend" as const;
    errors.push(data.message || `resend ${res.status}`);
  }

  try {
    const contact = await upsertGhlContact({
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`.trim(),
      email: input.to,
      phone: input.phone?.trim() || undefined,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return "ghl" as const;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }
  throw new Error(errors.join("; ") || "email is not configured");
}

export async function sendSteamOWeenReminders() {
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

  const registrations = JSON.parse(
    await fs.readFile(path.join(dataDir, "registrations.json"), "utf8"),
  ) as EventRegistration[];
  const groups = new Map<string, EventRegistration[]>();
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID) continue;
    const email = registration.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const list = groups.get(email) || [];
    list.push(registration);
    groups.set(email, list);
  }

  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const subject = `Tomorrow: ${event.title} at ${startTimeLabel(event.startsAt)}`;
  const already = await readMarker();
  let sent = 0;
  let skipped = 0;
  const failed: string[] = [];
  const via = new Set<string>();

  for (const [email, list] of groups) {
    if (already.has(email)) {
      skipped += 1;
      continue;
    }
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = list[list.length - 1];
    const kids = [];
    const seen = new Set<string>();
    for (const registration of list) {
      for (const kid of registration.kids || []) {
        const key = `${kid.name.trim().toLowerCase()}|${kid.age}`;
        if (seen.has(key)) continue;
        seen.add(key);
        kids.push(kid);
      }
    }
    const childLine = childrenLine(kids);
    const lines = [
      `Hi ${latest.firstName.trim()},`,
      "",
      `This is a reminder that you're registered for ${event.title} tomorrow.`,
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
    try {
      const channel = await sendOne({
        to: latest.email.trim(),
        firstName: latest.firstName.trim(),
        lastName: latest.lastName.trim(),
        phone: latest.phone,
        subject,
        text,
        html: textToHtml(text),
      });
      via.add(channel);
      already.add(email);
      await writeMarker(already);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      failed.push(message.replaceAll(email, "recipient"));
    }
  }

  return {
    ok: failed.length === 0,
    recipients: groups.size,
    sent,
    skipped,
    failed: failed.length,
    errors: failed,
    via: [...via],
  };
}
