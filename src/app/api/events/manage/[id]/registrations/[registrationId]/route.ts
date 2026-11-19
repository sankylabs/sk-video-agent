import { NextResponse } from "next/server";
import { isEventsDirectorAuthed } from "@/lib/event-auth";
import { cancelRegistration } from "@/lib/events";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; registrationId: string }> },
) {
  if (!(await isEventsDirectorAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, registrationId } = await ctx.params;
  const result = await cancelRegistration(id, registrationId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, spots: result.spots });
}
