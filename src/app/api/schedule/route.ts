import { NextResponse } from "next/server";
import { z } from "zod";
import {
  bookSlot,
  buildAvailabilityBrief,
  getUpcomingSlots,
  matchRequestedTime,
} from "@/lib/schedule";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day") || "";
  const time = searchParams.get("time") || "";
  const daysAhead = Number(searchParams.get("days") || 10);

  const slots = await getUpcomingSlots(daysAhead);

  if (day || time) {
    const { matches, exact } = matchRequestedTime(slots, day, time);
    return NextResponse.json({
      requested: { day, time },
      available: exact.length > 0,
      exactMatches: exact,
      alternatives: matches.slice(0, 8),
    });
  }

  const { brief } = await buildAvailabilityBrief(daysAhead);
  return NextResponse.json({
    brief,
    slots: slots.slice(0, 40),
    count: slots.length,
  });
}

const bookSchema = z.object({
  start: z.string().min(10),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  childName: z.string().optional(),
  childAge: z.string().optional(),
  childName2: z.string().optional(),
  childAge2: z.string().optional(),
  childName3: z.string().optional(),
  childAge3: z.string().optional(),
  leadId: z.string().optional(),
  ghlContactId: z.string().optional(),
});

/** Reserve a free-session slot on the GHL calendar (falls back to local). */
export async function POST(req: Request) {
  const parsed = bookSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide start as YYYY-MM-DDTHH:mm" },
      { status: 400 },
    );
  }

  const result = await bookSlot(parsed.data.start, {
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    childName: parsed.data.childName,
    childAge: parsed.data.childAge,
    childName2: parsed.data.childName2,
    childAge2: parsed.data.childAge2,
    childName3: parsed.data.childName3,
    childAge3: parsed.data.childAge3,
    leadId: parsed.data.leadId,
    ghlContactId: parsed.data.ghlContactId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, booking: result.booking });
}
