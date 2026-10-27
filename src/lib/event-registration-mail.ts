import { siteConfig } from "./config";
import {
  formatCost,
  formatEventSchedule,
  formatSubmitted,
  residentLabel,
  type AcademyEvent,
  type EventRegistration,
} from "./event-model";

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.steamojikirkland.com"
  );
}

export function buildEventRegistrationEmail(input: {
  event: Pick<AcademyEvent, "id" | "title" | "startsAt" | "endsAt" | "costCents">;
  registration: EventRegistration;
}) {
  const { event, registration } = input;
  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const parent = `${registration.firstName} ${registration.lastName}`.trim();
  const phone = registration.phone?.trim() || "—";
  const resident = residentLabel(registration.kirklandResident);
  const residence = registration.residence?.trim() || "";
  const children = registration.kids.map((kid) => `${kid.name}, age ${kid.age}`);
  const submitted = formatSubmitted(registration.createdAt);
  const eventUrl = `${appBaseUrl()}/events/${event.id}`;
  const subject = `Event registration: ${event.title} — ${parent}`;
  const lines = [
    `A family registered for an event at ${siteConfig.brand}.`,
    "",
    `Event: ${event.title}`,
    `When: ${schedule.dateLabel}, ${schedule.timeLabel}`,
    `Cost: ${formatCost(event.costCents)}`,
    `Page: ${eventUrl}`,
    "",
    `Parent: ${parent}`,
    `Email: ${registration.email}`,
    `Phone: ${phone}`,
    `Kirkland resident: ${resident}`,
    ...(registration.kirklandResident === false
      ? [`Where they reside: ${residence || "—"}`]
      : []),
    ...(children.length
      ? ["", "Children:", ...children.map((child) => `- ${child}`)]
      : []),
    "",
    `Submitted: ${submitted}`,
  ];
  const text = lines.join("\n");
  const childRows = registration.kids
    .map(
      (kid) =>
        `<tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Child</th><td>${htmlEscape(`${kid.name}, age ${kid.age}`)}</td></tr>`,
    )
    .join("");
  const html = `<p>A family registered for an event at ${htmlEscape(siteConfig.brand)}.</p>
<table cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.45;">
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Event</th><td>${htmlEscape(event.title)}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">When</th><td>${htmlEscape(`${schedule.dateLabel}, ${schedule.timeLabel}`)}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Cost</th><td>${htmlEscape(formatCost(event.costCents))}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Parent</th><td>${htmlEscape(parent)}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Email</th><td>${htmlEscape(registration.email)}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Phone</th><td>${htmlEscape(phone)}</td></tr>
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Kirkland resident</th><td>${htmlEscape(resident)}</td></tr>
  ${
    registration.kirklandResident === false
      ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Where they reside</th><td>${htmlEscape(residence || "—")}</td></tr>`
      : ""
  }
  ${childRows}
  <tr><th align="left" style="color:#5c5a70;font-weight:600;padding:4px 12px 4px 0;">Submitted</th><td>${htmlEscape(submitted)}</td></tr>
</table>
<p><a href="${htmlEscape(eventUrl)}">${htmlEscape(eventUrl)}</a></p>`;
  return { to: siteConfig.email, subject, text, html };
}

async function sendViaResend(email: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false as const, reason: "no-resend-key" };
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
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false as const,
      reason: (data as { message?: string }).message || `resend ${res.status}`,
    };
  }
  return { sent: true as const };
}

async function sendViaGhl(email: { to: string; subject: string; text: string; html: string }) {
  const { sendGhlEmail, upsertGhlContact } = await import("./ghl");
  const staff = await upsertGhlContact({
    name: siteConfig.brand,
    email: email.to,
    requireEmail: true,
  });
  await sendGhlEmail({
    contactId: staff.contactId,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function notifyEventRegistration(input: {
  event: Pick<AcademyEvent, "id" | "title" | "startsAt" | "endsAt" | "costCents">;
  registration: EventRegistration;
}) {
  const email = buildEventRegistrationEmail(input);
  const resend = await sendViaResend(email).catch((err: unknown) => ({
    sent: false as const,
    reason: err instanceof Error ? err.message : "resend failed",
  }));
  if (resend.sent) return { sent: true as const };

  try {
    await sendViaGhl(email);
    return { sent: true as const };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "ghl email failed";
    console.error("[events] registration email failed", resend.reason, reason);
    return { sent: false as const, reason };
  }
}
