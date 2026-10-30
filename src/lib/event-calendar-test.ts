import { promises as fs } from "fs";
import path from "path";
import { buildCalendarInviteTest } from "./event-calendar";
import { getPublicEvent } from "./events";
import { sendGhlEmail, upsertGhlContact } from "./ghl";

const EVENT_ID = "w-cj4EJWk7";
const markerFile = path.join(process.cwd(), ".data", "calendar-invite-test.json");

async function readMarker() {
  try {
    return JSON.parse(await fs.readFile(markerFile, "utf8")) as {
      sent?: boolean;
      sending?: boolean;
      at?: string;
    };
  } catch {
    return null;
  }
}

export async function calendarInviteTestFile() {
  const event = await getPublicEvent(EVENT_ID);
  if (!event) return null;
  return buildCalendarInviteTest(event);
}

async function deliver(invite: ReturnType<typeof buildCalendarInviteTest>) {
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
        to: [invite.to],
        subject: invite.subject,
        html: invite.html,
        text: invite.text,
        attachments: [
          {
            filename: invite.filename,
            content: Buffer.from(invite.ics, "utf8").toString("base64"),
            content_type: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) return "resend" as const;
    errors.push(data.message || `resend ${res.status}`);
  }
  try {
    const contact = await upsertGhlContact({
      name: invite.attendeeName,
      email: invite.to,
      requireEmail: true,
    });
    await sendGhlEmail({
      contactId: contact.contactId,
      to: invite.to,
      subject: invite.subject,
      html: invite.html,
      text: invite.text,
      attachments: [invite.fileUrl],
    });
    return "ghl" as const;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "ghl email failed");
  }
  throw new Error(errors.join("; ") || "email is not configured");
}

export async function sendCalendarInviteTest() {
  const existing = await readMarker();
  if (existing?.sent) return { ok: true as const, sent: "already" as const };
  if (existing?.sending && existing.at) {
    const age = Date.now() - new Date(existing.at).getTime();
    if (age >= 0 && age < 2 * 60 * 1000) {
      return { ok: true as const, sent: "in-progress" as const };
    }
  }
  const invite = await calendarInviteTestFile();
  if (!invite) throw new Error("Just for Moms is not published");
  await fs.mkdir(path.dirname(markerFile), { recursive: true });
  await fs.writeFile(
    markerFile,
    JSON.stringify({ sending: true, at: new Date().toISOString() }),
    "utf8",
  );
  try {
    const via = await deliver(invite);
    await fs.writeFile(
      markerFile,
      JSON.stringify({ sent: true, via, at: new Date().toISOString() }),
      "utf8",
    );
    return { ok: true as const, sent: via, reminder: "PT1H" as const };
  } catch (err) {
    await fs.rm(markerFile, { force: true });
    throw err;
  }
}
