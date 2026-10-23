import { NextResponse } from "next/server";
import { isEventsDirectorAuthed } from "@/lib/event-auth";
import { EventInputError, deleteEvent, updateEvent } from "@/lib/events";

async function rejectIfLocked() {
  if (await isEventsDirectorAuthed()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await rejectIfLocked();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const event = await updateEvent(id, await req.formData());
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof EventInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await rejectIfLocked();
  if (denied) return denied;
  const { id } = await ctx.params;
  const removed = await deleteEvent(id);
  if (!removed) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
