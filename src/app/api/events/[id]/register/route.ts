import { NextResponse } from "next/server";
import { z } from "zod";
import { EventInputError, registerForEvent } from "@/lib/events";

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  kids: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        age: z.number().int().min(1).max(18),
      }),
    )
    .min(1)
    .max(8),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a first name, last name, email, and each child’s name and age (1–18)." },
      { status: 400 },
    );
  }
  try {
    const result = await registerForEvent(id, parsed.data);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, registrationId: result.registration.id });
  } catch (error) {
    if (error instanceof EventInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
