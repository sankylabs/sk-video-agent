import { NextResponse } from "next/server";
import { z } from "zod";
import { syncEventRegistrationToGhl } from "@/lib/event-ghl-sync";
import { notifyEventRegistration } from "@/lib/event-registration-mail";
import { EventInputError, registerForEvent } from "@/lib/events";

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((value) => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15;
    }),
  kirklandResident: z.boolean(),
  residence: z.string().trim().max(120).optional(),
  kids: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        age: z.number().int().min(1).max(18),
      }),
    )
    .max(8)
    .optional()
    .default([]),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Enter a first name, last name, email, phone number, and whether you are a Kirkland resident.",
      },
      { status: 400 },
    );
  }
  try {
    const result = await registerForEvent(id, parsed.data);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await notifyEventRegistration({
      event: result.event,
      registration: result.registration,
    });
    await syncEventRegistrationToGhl({
      event: result.event,
      registration: result.registration,
    });
    return NextResponse.json({ ok: true, registrationId: result.registration.id });
  } catch (error) {
    if (error instanceof EventInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
