import { promises as fs } from "fs";
import path from "path";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const SUBJECT =
  "You're confirmed! Free 3D Design Workshop for Moms — Sunday, Nov 15 at 10:30 AM";
const TO = "kalyani.ar23@gmail.com";
const NAME = "Kalyani";
const markerFile = path.join(process.cwd(), ".data", "moms-reminder-kalyani.json");

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
    "- Design & Customize: We'll walk you through the basics of 3D design, show you a demo, and guide you as you create a design that have shortlisted.",
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
    "425-269-6694",
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
<li>🎨 <strong>Design &amp; Customize:</strong> We'll walk you through the basics of 3D design, show you a demo, and guide you as you create a design that have shortlisted.</li>
<li>☕ <strong>Relax &amp; Connect:</strong> Enjoy light refreshments, meet other moms, and have some well-deserved creative time for yourself!</li>
</ul>
${p("<strong>No tech experience needed!</strong> We'll provide everything you need.")}
${p("🎁 <strong>Your Creation Pickup:</strong> Since 3D printing takes time, we'll print your design after the workshop and notify you when it's ready for pickup at the academy.")}
${p("<strong>A quick favor:</strong> Since this is a free workshop with limited spots, please let us know if your plans change so we can offer your spot to another mom.")}
${p("We can't wait to meet you and spend a wonderful morning creating together!")}
${p("<strong>Moms - Let's get building! 💕</strong>")}
${p("Warm regards,<br><strong>Team Steamoji Kirkland</strong><br>355 Kirkland Avenue, Kirkland, WA 98033<br>📞 425-269-6694<br>📧 kirkland@steamoji.com")}
</div>`;

  return { subject: SUBJECT, text, html };
}

async function alreadySent() {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as { sent?: boolean };
    return parsed.sent === true;
  } catch {
    return false;
  }
}

export async function sendMomsReminderToKalyani() {
  if (await alreadySent()) return { ok: true as const, sent: "already" as const };
  const email = buildReminder(NAME);
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
        to: [TO],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) {
      await fs.mkdir(path.dirname(markerFile), { recursive: true });
      await fs.writeFile(markerFile, JSON.stringify({ sent: true, via: "resend" }), "utf8");
      return { ok: true as const, sent: "resend" as const };
    }
    errors.push(data.message || `resend ${res.status}`);
  }
  try {
    const contact = await upsertGhlContact({
      firstName: NAME,
      name: NAME,
      email: TO,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to: TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
    throw new Error(errors.join("; ") || "email is not configured");
  }
  await fs.mkdir(path.dirname(markerFile), { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify({ sent: true, via: "ghl" }), "utf8");
  return { ok: true as const, sent: "ghl" as const };
}
