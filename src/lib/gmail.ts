import { siteConfig } from "./config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type GoogleTokenFile = {
  refresh_token?: string;
  token_uri?: string;
  client_id?: string;
  client_secret?: string;
};

export type GmailSendResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | string };

function readToken(): GoogleTokenFile | null {
  const raw = process.env.GOOGLE_TOKEN_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleTokenFile;
    if (!parsed.refresh_token || !parsed.client_id || !parsed.client_secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeSubject(subject: string) {
  const clean = subject.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const encoded = Buffer.from(clean, "utf8").toString("base64");
  const chunks = encoded.match(/.{1,48}/g) ?? [encoded];
  return chunks.map((chunk) => `=?UTF-8?B?${chunk}?=`).join("\r\n ");
}

function wrapBase64(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

/** RFC 822 message, base64url-encoded for the Gmail API. */
export function buildGmailRaw(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const to = input.to.replace(/[\r\n]/g, "");
  const from = input.from.replace(/[\r\n]/g, "");
  const boundary = `sk_${Math.random().toString(36).slice(2, 12)}`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${siteConfig.email}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

async function accessToken(token: GoogleTokenFile) {
  const body = new URLSearchParams({
    client_id: token.client_id || "",
    client_secret: token.client_secret || "",
    refresh_token: token.refresh_token || "",
    grant_type: "refresh_token",
  });
  const res = await fetch(token.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `google token ${res.status}`);
  }
  return data.access_token;
}

/**
 * Send as the Google account in GOOGLE_TOKEN_JSON, the same secret the camp roster uses.
 * Sends only when that account is the academy mailbox.
 */
export async function sendAcademyGmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<GmailSendResult> {
  const token = readToken();
  if (!token) return { sent: false, reason: "not-configured" };
  try {
    const access = await accessToken(token);
    const profileRes = await fetch(GMAIL_PROFILE, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const profile = (await profileRes.json().catch(() => ({}))) as {
      emailAddress?: string;
      error?: { message?: string };
    };
    if (!profileRes.ok) {
      return { sent: false, reason: profile.error?.message || `gmail profile ${profileRes.status}` };
    }
    const account = profile.emailAddress?.trim().toLowerCase();
    if (account !== siteConfig.email.toLowerCase()) {
      return { sent: false, reason: "gmail account is not the academy mailbox" };
    }
    const raw = buildGmailRaw({
      from: `${siteConfig.brand} <${siteConfig.email}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    const res = await fetch(GMAIL_SEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { sent: false, reason: data.error?.message || `gmail ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "gmail failed" };
  }
}
