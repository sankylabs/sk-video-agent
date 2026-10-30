import { siteConfig } from "./config";
import {
  formatCost,
  formatEventSchedule,
  type AcademyEvent,
  type EventRegistration,
} from "./event-model";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

/** Just for Moms workshop. Confirmation mail is limited to this event. */
export const REGISTRATION_CONFIRMATION_EVENT_ID = "w-cj4EJWk7";

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

export function buildRegistrationConfirmation(input: {
  event: Pick<AcademyEvent, "title" | "startsAt" | "endsAt" | "costCents">;
  registration: Pick<EventRegistration, "firstName" | "kids">;
}) {
  const schedule = formatEventSchedule(input.event.startsAt, input.event.endsAt);
  const kids = input.registration.kids || [];
  const childLine = kids.length
    ? `Coming with you: ${kids.map((kid) => `${kid.name}, age ${kid.age}`).join("; ")}`
    : "";
  const lines = [
    `Hi ${input.registration.firstName.trim()},`,
    "",
    `You're registered for ${input.event.title} at ${siteConfig.brand}.`,
    "",
    schedule.dateLabel,
    schedule.timeLabel,
    siteConfig.address,
    formatCost(input.event.costCents),
    "",
    ...(childLine ? [childLine, ""] : []),
    `Questions? Call ${siteConfig.phone} or email ${siteConfig.email}.`,
    "",
    siteConfig.brand,
  ];
  const text = lines.join("\n");
  return {
    subject: `You're registered for ${input.event.title}`,
    text,
    html: textToHtml(text),
  };
}

export async function deliverRegistrationConfirmation(input: {
  event: Pick<AcademyEvent, "title" | "startsAt" | "endsAt" | "costCents">;
  registration: Pick<EventRegistration, "firstName" | "lastName" | "email" | "phone" | "kids">;
}) {
  const email = buildRegistrationConfirmation(input);
  const to = input.registration.email.trim();
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
    if (res.ok) return { sent: true as const };
    errors.push(data.message || `resend ${res.status}`);
  }

  try {
    const contact = await upsertGhlContact({
      firstName: input.registration.firstName.trim(),
      lastName: input.registration.lastName.trim(),
      name: `${input.registration.firstName} ${input.registration.lastName}`.trim(),
      email: to,
      phone: input.registration.phone?.trim() || undefined,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return { sent: true as const };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }
  return { sent: false as const, error: errors.join("; ") || "email is not configured" };
}
