import { siteConfig } from "./config";
import {
  createGhlContactNote,
  sendGhlEmail,
  upsertGhlContact,
} from "./ghl";
import type { Lead } from "./leads";
import { updateLead } from "./leads";

export type OutreachChannel = "chat" | "video";

export type StaffOutreachInput = {
  lead?: Lead | null;
  channel: OutreachChannel;
  userText?: string;
  recentMessages?: { role: string; content: string }[];
};

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function appBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.steamojikirkland.com"
  );
}

function field(label: string, value?: string | null) {
  const v = value?.trim();
  return v ? `${label}: ${v}` : `${label}: —`;
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function childLines(lead?: Lead | null) {
  const kids = [
    [lead?.childName, lead?.childAge],
    [lead?.childName2, lead?.childAge2],
    [lead?.childName3, lead?.childAge3],
  ].filter(([name, age]) => name || age);
  if (!kids.length) return { text: "Child: —", html: "<tr><th>Child</th><td>—</td></tr>" };
  const text = kids
    .map(([name, age], i) =>
      field(kids.length > 1 ? `Child ${i + 1}` : "Child", [name, age].filter(Boolean).join(", ")),
    )
    .join("\n");
  const html = kids
    .map(
      ([name, age], i) =>
        `<tr><th>${kids.length > 1 ? `Child ${i + 1}` : "Child"}</th><td>${htmlEscape(
          [name, age].filter(Boolean).join(", ") || "—",
        )}</td></tr>`,
    )
    .join("");
  return { text, html };
}

function transcriptSnippet(
  messages?: { role: string; content: string }[],
) {
  if (!messages?.length) return "";
  return messages
    .slice(-8)
    .map((m) => {
      const who = m.role === "user" ? "Parent" : "Maya";
      const body = m.content
        .replace(/\[(?:SLOT|PICK|BOOK|OFFER_REACH_OUT|REACH_OUT|MORE_SLOTS|SERVICES_IMAGE)[^\]]*\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return body ? `${who}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Staff email when a parent asks Maya to have a human reach out. */
export function buildStaffOutreachEmail(input: StaffOutreachInput) {
  const lead = input.lead;
  const parentName = lead?.name?.trim() || "a parent";
  const channelLabel = input.channel === "video" ? "live video" : "text chat";
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
  const chatId = lead?.ghlContactId || lead?.id;
  const chatUrl = chatId ? `${appBaseUrl()}/chat/${chatId}` : appBaseUrl();
  const kids = childLines(lead);
  const notes = [lead?.notes, lead?.crmNotes].filter(Boolean).join(" · ");
  const snippet = transcriptSnippet(input.recentMessages);

  const subject = `Maya: ${parentName} asked for a team member to reach out`;

  const text = [
    `A parent asked Maya (${siteConfig.personaTitle}) to have someone from ${siteConfig.brand} reach out.`,
    "",
    `Please call or email them. They preferred a person over continuing with the AI advisor.`,
    "",
    `When: ${when}`,
    `Channel: ${channelLabel}`,
    field("Parent", lead?.name),
    field("Email", lead?.email),
    field("Phone", lead?.phone),
    kids.text,
    field("Location", lead?.location || lead?.city || lead?.resideKirkland),
    field("GHL contact", lead?.ghlContactId),
    field("Maya chat", chatUrl),
    notes ? field("Notes", notes) : null,
    input.userText ? field("Their words", input.userText) : null,
    snippet ? `\nRecent chat:\n${snippet}` : null,
    "",
    `If they call first, academy line is ${siteConfig.phone}.`,
  ]
    .filter((line) => line != null)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:Arial,Helvetica,sans-serif;color:#1e2060;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e2da;">
          <tr>
            <td style="background:#2f3386;color:#ffffff;padding:20px 24px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Maya · ${htmlEscape(siteConfig.personaTitle)}</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;font-weight:700;">Parent asked for a team member to reach out</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Please <strong>call or email this family</strong>. They were with Maya on ${htmlEscape(channelLabel)} and asked to talk to someone from ${htmlEscape(siteConfig.brand)}.
              </p>
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="font-size:14px;line-height:1.45;border-collapse:collapse;">
                <tr><th align="left" style="width:140px;color:#5c5a70;font-weight:600;">When</th><td>${htmlEscape(when)}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Parent</th><td>${htmlEscape(lead?.name || "—")}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Email</th><td>${lead?.email ? `<a href="mailto:${htmlEscape(lead.email)}">${htmlEscape(lead.email)}</a>` : "—"}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Phone</th><td>${lead?.phone ? `<a href="tel:${htmlEscape(lead.phone)}">${htmlEscape(lead.phone)}</a>` : "—"}</td></tr>
                ${kids.html}
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Location</th><td>${htmlEscape(lead?.location || lead?.city || lead?.resideKirkland || "—")}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Maya chat</th><td><a href="${htmlEscape(chatUrl)}">${htmlEscape(chatUrl)}</a></td></tr>
                ${lead?.ghlContactId ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">GHL contact</th><td>${htmlEscape(lead.ghlContactId)}</td></tr>` : ""}
                ${notes ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">Notes</th><td>${htmlEscape(notes)}</td></tr>` : ""}
                ${input.userText ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">Their words</th><td>${htmlEscape(input.userText)}</td></tr>` : ""}
              </table>
              ${
                snippet
                  ? `<p style="margin:20px 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5c5a70;font-weight:700;">Recent chat</p>
              <pre style="margin:0;padding:12px 14px;background:#f7f6f2;border-radius:10px;white-space:pre-wrap;font-size:13px;line-height:1.45;">${htmlEscape(snippet)}</pre>`
                  : ""
              }
              <p style="margin:20px 0 0;font-size:13px;color:#5c5a70;">Academy line if they call first: ${htmlEscape(siteConfig.phone)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: siteConfig.email,
    subject,
    text,
    html,
    parentReply: `I'll have someone from the Steamoji Kirkland team reach out to you. You can also call us now at ${siteConfig.phone} if that's easier.`,
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
  return { sent: true as const, via: "resend" as const };
}

async function sendKirklandStaffEmail(input: {
  subject: string;
  text: string;
  html: string;
  lead?: Lead | null;
  leadNote?: string;
}) {
  const errors: string[] = [];
  const resend = await sendViaResend({
    to: siteConfig.email,
    subject: input.subject,
    text: input.text,
    html: input.html,
  }).catch((err: unknown) => ({
    sent: false as const,
    reason: err instanceof Error ? err.message : "resend failed",
  }));
  if (!resend.sent && resend.reason !== "no-resend-key") {
    errors.push(resend.reason);
  }

  let ghlEmailSent = false;
  try {
    const staff = await upsertGhlContact({
      name: siteConfig.brand,
      email: siteConfig.email,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: staff.contactId,
      to: siteConfig.email,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    ghlEmailSent = true;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }

  const leadContactId = input.lead?.ghlContactId || input.lead?.id;
  if (leadContactId && input.leadNote) {
    try {
      await createGhlContactNote(leadContactId, input.leadNote);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "ghl note failed");
    }
  }

  return { sent: resend.sent || ghlEmailSent, errors };
}

export async function sendStaffOutreach(input: StaffOutreachInput) {
  const lead = input.lead;
  if (lead?.staffOutreachAt) {
    const then = Date.parse(lead.staffOutreachAt);
    if (Number.isFinite(then) && Date.now() - then < DUPLICATE_WINDOW_MS) {
      return {
        ok: true as const,
        duplicate: true,
        parentReply: `Someone from the Steamoji Kirkland team is already lined up to reach out. You can also call ${siteConfig.phone} anytime.`,
      };
    }
  }

  const email = buildStaffOutreachEmail(input);
  const { sent, errors } = await sendKirklandStaffEmail({
    subject: email.subject,
    text: email.text,
    html: email.html,
    lead,
    leadNote: `Maya: parent asked for a team member to reach out (${input.channel}). ${email.text}`,
  });

  if (lead?.id) {
    await updateLead(lead.id, {
      staffOutreachAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  if (!sent) {
    console.error("[staff-outreach] email did not send", errors);
    return {
      ok: false as const,
      parentReply: `I wasn't able to notify the team just now — please call us at ${siteConfig.phone} or email ${siteConfig.email}.`,
      errors,
    };
  }

  return { ok: true as const, duplicate: false, parentReply: email.parentReply };
}

export type BookingFallbackInput = {
  lead?: Lead | null;
  channel: OutreachChannel;
  start?: string;
  spoken?: string;
  error?: string;
  requestedText?: string;
};

export function bookingFallbackParentReply(spoken: string) {
  return `I wasn't able to put ${spoken} on the calendar automatically, so I've asked the Steamoji Kirkland team to make that appointment for you. They'll confirm. You can also call us at ${siteConfig.phone}.`;
}

export function buildBookingFallbackEmail(input: BookingFallbackInput) {
  const lead = input.lead;
  const parentName = lead?.name?.trim() || "a parent";
  const spoken =
    input.spoken?.trim() ||
    input.start?.trim() ||
    input.requestedText?.trim() ||
    "a requested time";
  const channelLabel = input.channel === "video" ? "live video" : "text chat";
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
  const chatId = lead?.ghlContactId || lead?.id;
  const chatUrl = chatId ? `${appBaseUrl()}/chat/${chatId}` : appBaseUrl();
  const kids = childLines(lead);
  const notes = [lead?.notes, lead?.crmNotes].filter(Boolean).join(" · ");

  const subject = `Maya: please book a trial for ${parentName} — ${spoken}`;

  const text = [
    `Maya could not create this free-session appointment in GHL. Please book it on the Kirkland calendar for this contact.`,
    "",
    `Requested time: ${spoken}`,
    input.start ? `Slot id: ${input.start}` : null,
    input.requestedText ? `What they said: ${input.requestedText}` : null,
    input.error ? `Maya error: ${input.error}` : null,
    "",
    `When Maya asked: ${when}`,
    `Channel: ${channelLabel}`,
    field("Parent", lead?.name),
    field("Email", lead?.email),
    field("Phone", lead?.phone),
    kids.text,
    field("Location", lead?.location || lead?.city || lead?.resideKirkland),
    field("GHL contact", lead?.ghlContactId),
    field("Maya chat", chatUrl),
    notes ? field("Notes", notes) : null,
    "",
    `Academy line: ${siteConfig.phone}`,
  ]
    .filter((line) => line != null)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:Arial,Helvetica,sans-serif;color:#1e2060;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e2da;">
          <tr>
            <td style="background:#2f3386;color:#ffffff;padding:20px 24px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Maya · ${htmlEscape(siteConfig.personaTitle)}</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;font-weight:700;">Please book this free session in GHL</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Maya could not write the appointment automatically. Please <strong>create this trial on the calendar</strong> for the contact below.
              </p>
              <p style="margin:0 0 16px;padding:12px 14px;background:#f7f6f2;border-radius:10px;font-size:18px;font-weight:700;">
                ${htmlEscape(spoken)}
              </p>
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="font-size:14px;line-height:1.45;border-collapse:collapse;">
                ${input.start ? `<tr><th align="left" style="width:140px;color:#5c5a70;font-weight:600;">Slot id</th><td>${htmlEscape(input.start)}</td></tr>` : ""}
                <tr><th align="left" style="width:140px;color:#5c5a70;font-weight:600;">When asked</th><td>${htmlEscape(when)}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Channel</th><td>${htmlEscape(channelLabel)}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Parent</th><td>${htmlEscape(lead?.name || "—")}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Email</th><td>${lead?.email ? `<a href="mailto:${htmlEscape(lead.email)}">${htmlEscape(lead.email)}</a>` : "—"}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Phone</th><td>${lead?.phone ? `<a href="tel:${htmlEscape(lead.phone)}">${htmlEscape(lead.phone)}</a>` : "—"}</td></tr>
                ${kids.html}
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Location</th><td>${htmlEscape(lead?.location || lead?.city || lead?.resideKirkland || "—")}</td></tr>
                <tr><th align="left" style="color:#5c5a70;font-weight:600;">Maya chat</th><td><a href="${htmlEscape(chatUrl)}">${htmlEscape(chatUrl)}</a></td></tr>
                ${lead?.ghlContactId ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">GHL contact</th><td>${htmlEscape(lead.ghlContactId)}</td></tr>` : ""}
                ${notes ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">Notes</th><td>${htmlEscape(notes)}</td></tr>` : ""}
                ${input.error ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">Maya error</th><td>${htmlEscape(input.error)}</td></tr>` : ""}
                ${input.requestedText ? `<tr><th align="left" style="color:#5c5a70;font-weight:600;">What they said</th><td>${htmlEscape(input.requestedText)}</td></tr>` : ""}
              </table>
              <p style="margin:20px 0 0;font-size:13px;color:#5c5a70;">Academy line: ${htmlEscape(siteConfig.phone)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to: siteConfig.email,
    subject,
    text,
    html,
    spoken,
    parentReply: bookingFallbackParentReply(spoken),
  };
}

export async function sendBookingFallback(input: BookingFallbackInput) {
  const lead = input.lead;
  const startKey = (input.start || input.requestedText || "unparsed").trim();
  if (lead?.bookingFallbackAt && lead.bookingFallbackStart === startKey) {
    const then = Date.parse(lead.bookingFallbackAt);
    if (Number.isFinite(then) && Date.now() - then < DUPLICATE_WINDOW_MS) {
      const spoken =
        input.spoken?.trim() || input.start?.trim() || "that time";
      return {
        ok: true as const,
        duplicate: true,
        spoken,
        parentReply: bookingFallbackParentReply(spoken),
      };
    }
  }

  const email = buildBookingFallbackEmail(input);
  const { sent, errors } = await sendKirklandStaffEmail({
    subject: email.subject,
    text: email.text,
    html: email.html,
    lead,
    leadNote: `Maya: GHL booking failed; asked staff to create trial for ${email.spoken}. ${email.text}`,
  });

  if (sent && lead?.id) {
    await updateLead(lead.id, {
      bookingFallbackAt: new Date().toISOString(),
      bookingFallbackStart: startKey,
    }).catch(() => undefined);
  }

  if (!sent) {
    console.error("[book-fallback] email did not send", errors);
    return {
      ok: false as const,
      spoken: email.spoken,
      parentReply: `I wasn't able to put that on the calendar just now — please call us at ${siteConfig.phone} or email ${siteConfig.email}.`,
      errors,
    };
  }

  return {
    ok: true as const,
    duplicate: false,
    spoken: email.spoken,
    parentReply: email.parentReply,
  };
}
