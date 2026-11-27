import { promises as fs } from "fs";
import path from "path";
import type { EventRegistration } from "./event-model";
import { sendAcademyGmail } from "./gmail";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const EVENT_ID = "w-cj4EJWk7";
const SUBJECT = "Your 3D Creations Are Ready for Pickup! 🎉";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-pickup-email.json");
const lockFile = path.join(dataDir, "moms-pickup-email.lock");

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildPickup(firstName: string) {
  const name = firstName.trim() || "there";
  const text = [
    `Hi ${name},`,
    "",
    "Great news! 🎉 Your 3D-printed creations from our Moms' 3D Design & Printing Workshop are ready for pickup! We loved having you at the workshop and are excited for you to finally see your designs brought to life!",
    "",
    "🕒 Pickup Hours:",
    "Saturday: 10:00 AM – 5:00 PM",
    "Monday–Friday: 2:00 PM – 7:00 PM",
    "",
    "Feel free to stop by during any of the above hours to collect your creation. Thank you once again for spending your Sunday morning with us. We hope you enjoyed the experience as much as we enjoyed hosting you!",
    "",
    "We look forward to welcoming you back to Steamoji Kirkland! 💕",
    "",
    "Let's get building! 🚀",
    "",
    "Warm regards,",
    "Team Steamoji Kirkland",
    "📞 425-305-5642",
    "📧 kirkland@steamoji.com",
  ].join("\n");

  const p = (body: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1e2060;">${body}</p>`;
  const html = `<div style="font-family:Georgia,serif;max-width:560px;">
${p(`Hi ${escapeHtml(name)},`)}
${p("Great news! 🎉 Your 3D-printed creations from our Moms' 3D Design &amp; Printing Workshop are ready for pickup! We loved having you at the workshop and are excited for you to finally see your designs brought to life!")}
${p("<strong>🕒 Pickup Hours:</strong><br>Saturday: 10:00 AM – 5:00 PM<br>Monday–Friday: 2:00 PM – 7:00 PM")}
${p("Feel free to stop by during any of the above hours to collect your creation. Thank you once again for spending your Sunday morning with us. We hope you enjoyed the experience as much as we enjoyed hosting you!")}
${p("We look forward to welcoming you back to Steamoji Kirkland! 💕")}
${p("<strong>Let's get building! 🚀</strong>")}
${p("Warm regards,<br><strong>Team Steamoji Kirkland</strong><br>📞 425-305-5642<br>📧 kirkland@steamoji.com")}
</div>`;
  return { subject: SUBJECT, text, html };
}

type Parent = { email: string; firstName: string; lastName: string };

function parentsFor(registrations: EventRegistration[]): Parent[] {
  const groups = new Map<string, EventRegistration[]>();
  for (const registration of registrations) {
    if (registration.eventId !== EVENT_ID || registration.cancelledAt) continue;
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

function publicReason(reason: string) {
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:pit|sk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "recipient")
    .slice(0, 300);
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
  const email = buildPickup(parent.firstName);
  const gmail = await sendAcademyGmail({
    to: parent.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  if (gmail.sent) return "gmail" as const;
  if (gmail.reason !== "not-configured") {
    console.error("[moms-pickup-email] gmail skipped", publicReason(gmail.reason));
  }
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
}

export async function sendMomsPickupEmails() {
  if (!(await claimLock())) {
    return {
      ok: false,
      reason: "in-progress",
      parents: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
      via: [] as string[],
    };
  }
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
        errors.push(publicReason(message.replaceAll(parent.email, "recipient")));
      }
    }
    console.log(
      `[moms-pickup-email] sent ${sent} skipped ${skipped} failed ${errors.length} of ${parents.length}`,
    );
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
