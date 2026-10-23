import { NextResponse } from "next/server";
import { getPosterFile } from "@/lib/events";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const poster = await getPosterFile(id);
  if (!poster) {
    return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(poster.bytes), {
    headers: {
      "Content-Type": poster.type,
      "Cache-Control": "no-cache",
    },
  });
}
