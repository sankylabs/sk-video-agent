import { sendGhlEmail, upsertGhlContact } from "./ghl";

type LaunchChannel = "video" | "chat";

const DEFAULT_TO = "sankethka@metra.io";

function launchTo() {
  return process.env.MAYA_LAUNCH_EMAIL?.trim() || DEFAULT_TO;
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mayaLaunchCopy(input: {
  leadName?: string;
  channel: LaunchChannel;
}) {
  const name = input.leadName?.trim() || "A lead";
  const via = input.channel === "video" ? "video" : "text chat";
  const text = `${name} just started Maya (${via}).`;
  return {
    subject: `Maya started — ${name}`,
    text,
    html: `<p>${htmlEscape(text)}</p>`,
  };
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

export async function notifyMayaLaunch(input: {
  leadName?: string;
  channel: LaunchChannel;
}) {
  const to = launchTo();
  const email = mayaLaunchCopy(input);

  const resend = await sendViaResend({ to, ...email }).catch((err: unknown) => ({
    sent: false as const,
    reason: err instanceof Error ? err.message : "resend failed",
  }));
  if (resend.sent) return;

  const staff = await upsertGhlContact({
    name: "Sanketh",
    email: to,
    requireEmail: true,
  });
  await sendGhlEmail({
    contactId: staff.contactId,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
