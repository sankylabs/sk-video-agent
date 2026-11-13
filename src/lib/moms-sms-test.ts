import { promises as fs } from "fs";
import path from "path";
import { sendSms } from "./sms";

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

function publicReason(reason: string) {
  return reason.replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]").slice(0, 300);
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

  const result = await sendSms(TEST_TO, message);
  if (!result.sent) {
    await fs.rm(lockFile, { force: true });
    return { ok: false as const, sent: false as const, reason: publicReason(result.reason) };
  }

  await fs.writeFile(
    markerFile,
    JSON.stringify({ sentAt: new Date().toISOString(), via: "twilio" }),
    "utf8",
  );
  await fs.rm(lockFile, { force: true });
  return { ok: true as const, sent: true as const, via: "twilio" as const };
}
