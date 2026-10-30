import { siteConfig } from "./config";
import { formatEventSchedule } from "./event-model";

const TEST_EVENT_ID = "w-cj4EJWk7";
const TEST_TO = "sankethka@outlook.com";
const TEST_NAME = "Sanketh";

/** Public download for the test invite. Stays up so the email link keeps working. */
export function calendarInviteTestUrl() {
  const origin =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.steamojikirkland.com";
  return `${origin}/api/events/calendar-invite-test/invite.ics`;
}

function icsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function foldLine(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + limit, bytes.length);
    const piece = bytes.subarray(start, end).toString("utf8");
    parts.push(start === 0 ? piece : ` ${piece}`);
    start = end;
    limit = 74;
  }
  return parts.join("\r\n");
}

function icsUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsPacific(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function clip(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

const VTIMEZONE_LINES = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "X-LIC-LOCATION:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildEventCalendarIcs(input: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  url: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  now?: Date;
}) {
  const start = new Date(input.startsAt);
  const reminderAt = new Date(start.getTime() - 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Steamoji Kirkland//Events//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    ...VTIMEZONE_LINES,
    "BEGIN:VEVENT",
    `UID:${icsText(input.uid)}`,
    `DTSTAMP:${icsUtc(input.now ?? new Date())}`,
    `DTSTART;TZID=America/Los_Angeles:${icsPacific(input.startsAt)}`,
    `DTEND;TZID=America/Los_Angeles:${icsPacific(input.endsAt)}`,
    `SUMMARY:${icsText(input.title)}`,
    `DESCRIPTION:${icsText(input.description)}`,
    `LOCATION:${icsText(input.location)}`,
    `URL:${icsText(input.url)}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    `ORGANIZER;CN=${icsText(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${icsText(input.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
    "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
    "X-MICROSOFT-CDO-REMINDERDELTA:60",
    `X-MICROSOFT-CDO-REMINDERTIME:${icsUtc(reminderAt)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:This event starts in 1 hour",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function textToHtml(text: string) {
  const blocks = text
    .split("\n")
    .map((line) =>
      line
        ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#1e2060;">${escapeHtml(line)}</p>`
        : "",
    )
    .join("");
  return `<div style="font-family:Georgia,serif;max-width:560px;">${blocks}</div>`;
}

export function buildCalendarInviteTest(event: {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}) {
  if (event.id !== TEST_EVENT_ID) {
    throw new Error("Calendar invite test is only for Just for Moms.");
  }
  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const pageUrl = `https://www.steamojikirkland.com/events/${event.id}`;
  const fileUrl = calendarInviteTestUrl();
  const description = [
    "Test calendar invite for Steamoji Kirkland. This was not sent to people registered for the workshop.",
    clip(event.description, 600),
    `${schedule.dateLabel}. ${schedule.timeLabel}.`,
    siteConfig.address,
    pageUrl,
  ]
    .filter(Boolean)
    .join("\n");
  const ics = buildEventCalendarIcs({
    uid: `calendar-test-${event.id}@steamojikirkland.com`,
    title: event.title,
    description,
    location: siteConfig.address,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    url: pageUrl,
    organizerName: siteConfig.brand,
    organizerEmail: siteConfig.email,
    attendeeName: TEST_NAME,
    attendeeEmail: TEST_TO,
  });
  const text = [
    "This is a test calendar invite. Nobody registered for the workshop was invited.",
    "",
    event.title,
    schedule.dateLabel,
    schedule.timeLabel,
    siteConfig.address,
    "",
    "The invite includes a reminder 1 hour before the start. Open the attached file, or add it from this link:",
    fileUrl,
    "",
    "Accept the invite so the reminder is saved on your calendar. Outlook sometimes uses your account's default reminder instead of the 1-hour reminder in the file.",
    "",
    siteConfig.brand,
  ].join("\n");
  return {
    to: TEST_TO,
    attendeeName: TEST_NAME,
    filename: "just-for-moms.ics",
    fileUrl,
    ics,
    subject: `Test calendar invite: ${event.title}`,
    text,
    html: textToHtml(text),
  };
}
