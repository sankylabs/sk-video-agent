import type { EventRegistration } from "./event-model";
import { getGhlConfig, upsertGhlContact } from "./ghl";

export function usableEventPhone(raw: string | undefined) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function laserConfirmationSms(firstName: string) {
  const name = firstName.trim() || "there";
  return [
    `Hi ${name}! You're registered for Laser Cutting & Design at Steamoji Kirkland, Saturday Nov 21, 1:30\u20133:00 PM. 355 Kirkland Avenue. Details are in your email. See you Saturday!`,
    "\u2013 Steamoji Kirkland",
  ].join("\n");
}

export function laserFridaySms(firstName: string) {
  const name = firstName.trim() || "there";
  return [
    `Hi ${name}! Reminder: the Laser Cutting & Design Workshop is tomorrow, Saturday Nov 21, 1:30\u20133:00 PM at Steamoji Kirkland, 355 Kirkland Avenue. Your child will design and laser-cut a Thanksgiving candle holder to take home. See you Saturday!`,
    "\u2013 Steamoji Kirkland",
  ].join("\n");
}

function publicReason(reason: string) {
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:pit|sk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]")
    .slice(0, 300);
}

async function sendGhlSms(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
}) {
  const config = getGhlConfig();
  if (!config) throw new Error("GoHighLevel is not configured");
  const contact = await upsertGhlContact({
    firstName: input.firstName,
    lastName: input.lastName,
    name: `${input.firstName} ${input.lastName}`.trim(),
    email: input.email || undefined,
    phone: input.phone,
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
      message: input.message,
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

export async function deliverLaserConfirmationSms(
  registration: Pick<EventRegistration, "firstName" | "lastName" | "email" | "phone">,
): Promise<{ sent: true } | { sent: false; error: string }> {
  const phone = usableEventPhone(registration.phone);
  if (!phone) return { sent: false, error: "no usable phone" };
  try {
    await sendGhlSms({
      firstName: registration.firstName.trim(),
      lastName: registration.lastName.trim(),
      email: registration.email.trim(),
      phone,
      message: laserConfirmationSms(registration.firstName),
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "text failed";
    return { sent: false, error: publicReason(message) };
  }
}
