import { promises as fs } from "fs";
import path from "path";
import type { EventRegistration } from "./event-model";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const EVENT_ID = "w-cj4EJWk7";
const SUBJECT =
  "You're confirmed! Free 3D Design Workshop for Moms — Sunday, Nov 15 at 10:30 AM";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-reminder-sent.json");
const lockFile = path.join(dataDir, "moms-reminder-sent.lock");

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildReminder(name: string) {
  const text = [
    `Hi ${name},`,
    "",
    "We're excited to welcome you to our FREE 3D Design & Printing Workshop for Moms at Steamoji Kirkland this Sunday! 💕",
    "",
    "Date: Sunday, November 15, 2026",
    "Time: 10:30 AM – 12:00 PM",
    "Location: Steamoji Kirkland",
    "355 Kirkland Avenue, Kirkland, WA 98033",
    "",
    "Get ready for a fun, relaxing, and creative morning! Whether you're completely new to 3D design or simply curious to try something different, we've got you covered.",
    "",
    "Here's what to look forward to:",
    "",
    "- Design & Customize: We'll walk you through the basics of 3D design, show you a demo, and guide you as you create a design that we have shortlisted.",
    "- Relax & Connect: Enjoy light refreshments, meet other moms, and have some well-deserved creative time for yourself!",
    "",
    "No tech experience needed! We'll provide everything you need.",
    "",
    "Your Creation Pickup: Since 3D printing takes time, we'll print your design after the workshop and notify you when it's ready for pickup at the academy.",
    "",
    "A quick favor: Since this is a free workshop with limited spots, please let us know if your plans change so we can offer your spot to another mom.",
    "",
    "We can't wait to meet you and spend a wonderful morning creating together!",
    "",
    "Moms - Let's get building! 💕",
    "",
    "Warm regards,",
    "Team Steamoji Kirkland",
    "355 Kirkland Avenue, Kirkland, WA 98033",
    "425-305-5642",
    "kirkland@steamoji.com",
  ].join("\n");

  const p = (body: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1e2060;">${body}</p>`;
  const html = `<div style="font-family:Georgia,serif;max-width:560px;">
${p(`Hi ${escapeHtml(name)},`)}
${p("We're excited to welcome you to our <strong>FREE 3D Design &amp; Printing Workshop for Moms</strong> at Steamoji Kirkland this Sunday! 💕")}
${p("<strong>📅 Date:</strong> Sunday, November 15, 2026<br><strong>⏰ Time:</strong> 10:30 AM – 12:00 PM<br><strong>📍 Location:</strong> Steamoji Kirkland<br>355 Kirkland Avenue, Kirkland, WA 98033")}
${p("Get ready for a fun, relaxing, and creative morning! Whether you're completely new to 3D design or simply curious to try something different, we've got you covered.")}
${p("<strong>Here's what to look forward to:</strong>")}
<ul style="margin:0 0 14px;padding-left:1.2rem;font-size:16px;line-height:1.5;color:#1e2060;">
<li>🎨 <strong>Design &amp; Customize:</strong> We'll walk you through the basics of 3D design, show you a demo, and guide you as you create a design that we have shortlisted.</li>
<li>☕ <strong>Relax &amp; Connect:</strong> Enjoy light refreshments, meet other moms, and have some well-deserved creative time for yourself!</li>
</ul>
${p("<strong>No tech experience needed!</strong> We'll provide everything you need.")}
${p("🎁 <strong>Your Creation Pickup:</strong> Since 3D printing takes time, we'll print your design after the workshop and notify you when it's ready for pickup at the academy.")}
${p("<strong>A quick favor:</strong> Since this is a free workshop with limited spots, please let us know if your plans change so we can offer your spot to another mom.")}
${p("We can't wait to meet you and spend a wonderful morning creating together!")}
${p("<strong>Moms - Let's get building! 💕</strong>")}
${p("Warm regards,<br><strong>Team Steamoji Kirkland</strong><br>355 Kirkland Avenue, Kirkland, WA 98033<br>📞 425-305-5642<br>📧 kirkland@steamoji.com")}
</div>`;
  return { subject: SUBJECT, text, html };
}

type Parent = { email: string; firstName: string; lastName: string };

function parentsFor(registrations: EventRegistration[]): Parent[] {
  const groups = new Map<string, EventRegistration[]>();
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID) continue;
    const email = registration.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const list = groups.get(email) || [];
    list.push(registration);
    groups.set(email, list);
  }
  const parents: Parent[] = [];
  for (const [email, list] of groups) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = list[list.length - 1];
    parents.push({
      email,
      firstName: latest.firstName.trim(),
      lastName: latest.lastName.trim(),
    });
  }
  return parents;
}

async function readMarker(): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as { sent?: string[] };
    return new Set((parsed.sent || []).map((email) => email.toLowerCase()));
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
  const email = buildReminder(parent.firstName || "there");
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

export async function sendMomsWorkshopReminders() {
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
    const parents = parentsFor(registrations);
    const already = await readMarker();
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const via = new Set<string>();
    for (const parent of parents) {
      if (already.has(parent.email)) {
        skipped += 1;
        continue;
      }
      try {
        via.add(await sendOne(parent));
        already.add(parent.email);
        await writeMarker(already);
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        errors.push(message.replaceAll(parent.email, "recipient").slice(0, 240));
      }
    }
    return {
      ok: errors.length === 0,
      parents: parents.length,
      sent,
      skipped,
      failed: errors.length,
      errors,
      via: [...via],
    };
  } finally {
    await fs.rm(lockFile, { force: true });
  }
}
