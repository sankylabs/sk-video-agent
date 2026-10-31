import { promises as fs } from "fs";
import path from "path";
import { getGhlConfig, upsertGhlContact } from "./ghl";
import { sendSms } from "./sms";

const to = "+14258028583";
const markerFile = path.join(process.cwd(), ".data", "steamoween-sms-test.json");

const message = [
  "🎃 Happy Halloween from Steamoji Kirkland! 👻",
  "We're excited to welcome your child to our STEAM-O-WEEN 3D Design Workshop today at 1:30 PM! Get ready for some spooky, creative fun! 🕸️🎨",
  "See you soon! 🎃",
].join("\n");

async function alreadySent() {
  try {
    const parsed = JSON.parse(await fs.readFile(markerFile, "utf8")) as { sent?: boolean };
    return parsed.sent === true;
  } catch {
    return false;
  }
}

async function sendViaGhl() {
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
      message,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `GHL ${res.status}`;
    try {
      const data = JSON.parse(text) as { message?: string };
      if (data.message) detail = data.message.slice(0, 300);
    } catch {
      if (text) detail = text.slice(0, 300);
    }
    throw new Error(detail);
  }
}

export async function sendSteamoweenSmsTest() {
  if (await alreadySent()) return { ok: true as const, sent: "already" as const };
  const twilio = await sendSms(to, message);
  let via: "twilio" | "ghl";
  if (twilio.sent) {
    via = "twilio";
  } else if (twilio.reason.includes("not configured")) {
    await sendViaGhl();
    via = "ghl";
  } else {
    throw new Error(twilio.reason);
  }
  await fs.mkdir(path.dirname(markerFile), { recursive: true });
  await fs.writeFile(markerFile, JSON.stringify({ sent: true, via }), "utf8");
  return { ok: true as const, sent: via };
}
