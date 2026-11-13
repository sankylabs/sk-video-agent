import { promises as fs } from "fs";
import path from "path";
import { getGhlConfig, upsertGhlContact } from "./ghl";

const TEST_TO = "+14258028583";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-sms-test.json");
const lockFile = path.join(dataDir, "moms-sms-test.lock");

const message = [
  "Hi Sanketh! 💕 Just a friendly reminder about your FREE 3D Design & Printing Workshop for Moms at Steamoji Kirkland this Sunday, Nov 15, from 10:30 AM\u201312 PM! 🎨",
  "We're excited to have you join us! We've also sent you an email with all the details. Please check it out before your visit.",
  "See you Sunday! 😊",
  "",
  "\u2013 Team Steamoji Kirkland",
].join("\n");

/** 10-digit numbers become +1XXXXXXXXXX. 11-digit numbers starting with 1 keep the leading +. */
function ghlPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

function publicReason(reason: string) {
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:pit|sk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]")
    .slice(0, 300);
}

async function sendViaGhl(phone: string) {
  const config = getGhlConfig();
  if (!config) throw new Error("GoHighLevel is not configured");
  const contact = await upsertGhlContact({
    firstName: "Sanketh",
    name: "Sanketh",
    phone,
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

export async function sendMomsSmsTest() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(markerFile);
    return { ok: true as const, sent: "already" as const };
  } catch {
    /* first send */
  }
  try {
    await fs.writeFile(lockFile, new Date().toISOString(), { flag: "wx" });
  } catch {
    return { ok: true as const, sent: "in-progress" as const };
  }

  try {
    await sendViaGhl(ghlPhone(TEST_TO));
  } catch (err) {
    await fs.rm(lockFile, { force: true });
    const reason = err instanceof Error ? err.message : "GoHighLevel SMS failed";
    return { ok: false as const, sent: false as const, reason: publicReason(reason) };
  }

  await fs.writeFile(
    markerFile,
    JSON.stringify({ sentAt: new Date().toISOString(), via: "ghl" }),
    "utf8",
  );
  await fs.rm(lockFile, { force: true });
  return { ok: true as const, sent: true as const, via: "ghl" as const };
}
