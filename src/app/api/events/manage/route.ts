import { NextResponse } from "next/server";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { EventInputError, createEvent, listDirectorEvents } from "@/lib/events";

async function rejectIfLocked() {
  if (await isEventsDirectorAuthed()) return null;
  return NextResponse.json(
    {
      error: "Unauthorized",
      setup: eventsDirectorAuthRequired() && !eventsDirectorSecret(),
    },
    { status: 401 },
  );
}

export async function GET() {
  const denied = await rejectIfLocked();
  if (denied) return denied;
  return NextResponse.json({
    openLocally: !eventsDirectorSecret(),
    events: await listDirectorEvents(),
  });
}

export async function POST(req: Request) {
  const denied = await rejectIfLocked();
  if (denied) return denied;
  try {
    const event = await createEvent(await req.formData());
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof EventInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
