import { NextResponse } from "next/server";
import {
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
