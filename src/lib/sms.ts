import { siteConfig } from "./config";

export function buildMayaSms(opts: {
  chatUrl: string;
  name?: string;
  childName?: string;
}) {
  const hello = opts.name ? `Hi ${opts.name}` : "Hi";
  const child = opts.childName ? ` for ${opts.childName}` : "";
  return `${hello} — thanks for your interest in ${siteConfig.brand}${child}! Talk with Maya (our AI enrollment advisor) on a quick video chat: ${opts.chatUrl}`;
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return {
      sent: false as const,
      reason: "Twilio is not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER)",
    };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false as const,
      reason: data.message || `Twilio error ${res.status}`,
      details: data,
    };
  }

  return { sent: true as const, sid: data.sid as string };
}
