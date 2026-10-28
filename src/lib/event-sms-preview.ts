import { promises as fs } from "fs";
import path from "path";
import { getGhlConfig, upsertGhlContact } from "./ghl";
import { sendSms } from "./sms";

const to = "+14258028583";
const markerFile = path.join(process.cwd(), ".data", "event-sms-preview.json");

const messages = [
  {
    key: "confirmation" as const,
    body: "Steamoji Kirkland: You're registered for Steam-O-Ween 3D design Workshop. Sat Oct 31, 1:30-3:30 PM PT. 355 Kirkland Ave. With you: Mia, age 8. (425) 305-5642",
  },
  {
    key: "reminder" as const,
    body: "Steamoji Kirkland: Tomorrow, Steam-O-Ween 3D design Workshop. Sat Oct 31, 1:30-3:30 PM PT. 355 Kirkland Ave. With you: Mia, age 8. (425) 305-5642",
  },
];

type Marker = { confirmation?: boolean; reminder?: boolean };

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

async function sendViaGhl(body: string) {
  const config = getGhlConfig();
  if (!config) throw new Error("GoHighLevel is not configured");
  const contact = await upsertGhlContact({
    name: "Sanketh",
    phone: to,
    requireEmail: false,
  });
  const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Version: process.env.GHL_API_VERSION || "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "SMS",
      contactId: contact.contactId,
      message: body,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const data = JSON.parse(text) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      /* keep text */
    }
    throw new Error(`GHL ${res.status}: ${message}`);
  }
}

async function sendOne(body: string) {
  const twilio = await sendSms(to, body);
  if (twilio.sent) return "twilio" as const;
  if (!twilio.reason.includes("not configured")) {
    throw new Error(twilio.reason);
  }
  await sendViaGhl(body);
  return "ghl" as const;
}

export async function sendEventSmsPreview() {
  const marker = await readMarker();
  const sent: string[] = [];
  const errors: string[] = [];
  for (const message of messages) {
    if (marker[message.key]) {
      sent.push(`${message.key}:already`);
      continue;
    }
    try {
      const via = await sendOne(message.body);
      marker[message.key] = true;
      await writeMarker(marker);
      sent.push(`${message.key}:${via}`);
    } catch (err) {
      errors.push(`${message.key}: ${err instanceof Error ? err.message : "send failed"}`);
    }
  }
  return { ok: errors.length === 0, sent, errors };
}
