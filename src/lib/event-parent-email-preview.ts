import { promises as fs } from "fs";
import path from "path";
import { siteConfig } from "./config";

const to = "sankethka@outlook.com";
const markerFile = path.join(process.cwd(), ".data", "parent-email-preview.json");

type Marker = { confirmation?: boolean; reminder?: boolean };

function previewEmails() {
  const phone = siteConfig.phone;
  const email = siteConfig.email;
  const place = siteConfig.address;
  const brand = siteConfig.brand;
  const note =
    "This is a test preview. It uses a sample registration, not a real signup.";
  const confirmationText = [
    note,
    "",
    "Hi Jordan,",
    "",
    "You're registered for Steam-O-Ween 3D design Workshop at Steamoji Kirkland.",
    "",
    "Saturday, October 31, 2026",
    "1:30 PM – 3:30 PM PT",
    place,
    "Free",
    "",
    "Coming with you: Mia, age 8",
    "",
    `Questions? Call ${phone} or email ${email}.`,
    "",
    brand,
  ].join("\n");
  const reminderText = [
    note,
    "",
    "Hi Jordan,",
    "",
    "This is a reminder that you're registered for Steam-O-Ween 3D design Workshop tomorrow.",
    "",
    "Saturday, October 31, 2026",
    "1:30 PM – 3:30 PM PT",
    place,
    "",
    "Coming with you: Mia, age 8",
    "",
    `We look forward to seeing you. Questions? Call ${phone} or email ${email}.`,
    "",
    brand,
  ].join("\n");
  return [
    {
      key: "confirmation" as const,
      subject: "You're registered for Steam-O-Ween 3D design Workshop",
      text: confirmationText,
      html: textToHtml(confirmationText),
    },
    {
      key: "reminder" as const,
      subject: "Tomorrow: Steam-O-Ween 3D design Workshop at 1:30 PM",
      text: reminderText,
      html: textToHtml(reminderText),
    },
  ];
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function readMarker(): Promise<Marker> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as Marker;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMarker(marker: Marker) {
  await fs.mkdir(path.dirname(markerFile), { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify(marker), "utf8");
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
    if (res.ok) return { sent: true as const, via: "resend" as const };
    errors.push(data.message || `resend ${res.status}`);
  }

  try {
    const { sendGhlEmail, upsertGhlContact } = await import("./ghl");
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
    return { sent: true as const, via: "ghl" as const };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }
  return { sent: false as const, error: errors.join("; ") || "email is not configured" };
}

export async function sendParentEmailPreview() {
  const marker = await readMarker();
  const sent: string[] = [];
  const errors: string[] = [];
  for (const email of previewEmails()) {
    if (marker[email.key]) {
      sent.push(`${email.key}:already`);
      continue;
    }
    try {
      const result = await sendOne(email);
      if (!result.sent) {
        errors.push(`${email.key}: ${result.error}`);
        continue;
      }
      marker[email.key] = true;
      await writeMarker(marker);
      sent.push(`${email.key}:${result.via}`);
    } catch (err) {
      errors.push(`${email.key}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }
  return { ok: errors.length === 0, sent, errors };
}
