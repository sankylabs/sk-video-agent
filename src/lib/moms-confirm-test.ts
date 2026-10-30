import { promises as fs } from "fs";
import path from "path";
import { siteConfig } from "./config";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const to = "sankethka@outlook.com";
const markerFile = path.join(process.cwd(), ".data", "moms-confirm-test.json");

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

function message() {
  const text = [
    "This is a test preview. It uses a sample registration, not a real signup.",
    "",
    "Hi Jordan,",
    "",
    "You're registered for Just for Moms - FREE 3D Design & Printing Workshop at Steamoji Kirkland.",
    "",
    "Sunday, November 15, 2026",
    "10:30 AM – 12:00 PM PT",
    siteConfig.address,
    "Free",
    "",
    `Questions? Call ${siteConfig.phone} or email ${siteConfig.email}.`,
    "",
    siteConfig.brand,
  ].join("\n");
  return {
    subject: "You're registered for Just for Moms - FREE 3D Design & Printing Workshop",
    text,
    html: textToHtml(text),
  };
}

async function alreadySent() {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as { sent?: boolean };
    return parsed.sent === true;
  } catch {
    return false;
  }
}

async function sendOne(email: { subject: string; text: string; html: string }) {
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
        to: [to],
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
      name: "Sanketh",
      email: to,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to,
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

export async function sendMomsConfirmationTest() {
  if (await alreadySent()) return { ok: true, sent: "already" };
  const via = await sendOne(message());
  await fs.mkdir(path.dirname(markerFile), { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify({ sent: true, via }), "utf8");
  return { ok: true, sent: via };
}
