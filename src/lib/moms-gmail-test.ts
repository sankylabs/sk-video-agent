import { promises as fs } from "fs";
import path from "path";
import { buildRegistrationConfirmation } from "./event-confirmation-mail";
import { sendAcademyGmail } from "./gmail";

const TEST_TO = "kalyani.ar23@gmail.com";
const dataDir = path.join(process.cwd(), ".data");
const markerFile = path.join(dataDir, "moms-gmail-test.json");
const lockFile = path.join(dataDir, "moms-gmail-test.lock");

export async function sendMomsGmailTest() {
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

  const email = buildRegistrationConfirmation({
    event: {
      title: "Just for Moms - FREE 3D Design & Printing Workshop",
      startsAt: "2026-11-15T18:30:00.000Z",
      endsAt: "2026-11-15T20:00:00.000Z",
      costCents: 0,
    },
    registration: { firstName: "Kalyani", kids: [] },
  });
  const result = await sendAcademyGmail({
    to: TEST_TO,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  if (!result.sent) {
    await fs.rm(lockFile, { force: true });
    return { ok: false as const, sent: false as const, reason: result.reason };
  }
  await fs.writeFile(markerFile, JSON.stringify({ sentAt: new Date().toISOString() }), "utf8");
  await fs.rm(lockFile, { force: true });
  return { ok: true as const, sent: true as const, via: "gmail" as const };
}
