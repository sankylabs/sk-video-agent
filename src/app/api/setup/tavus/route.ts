import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getTavusApiKey,
  hasLivingVideo,
  setTavusApiKey,
} from "@/lib/runtime-secrets";
import {
  clearCachedPal,
  ensureMayaPal,
  normalizeApiKey,
  verifyTavusKey,
} from "@/lib/tavus";

const bodySchema = z.object({
  apiKey: z.string().min(8),
});

export async function GET() {
  return NextResponse.json({
    configured: hasLivingVideo(),
    source: getTavusApiKey()
      ? process.env.TAVUS_API_KEY &&
        getTavusApiKey() === process.env.TAVUS_API_KEY
        ? "env"
        : "runtime"
      : null,
  });
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paste the full API key from Tavus PAL Maker." },
      { status: 400 },
    );
  }

  const normalized = normalizeApiKey(parsed.data.apiKey);
  const verified = await verifyTavusKey(normalized);

  if (!verified.ok) {
    return NextResponse.json(
      {
        error: verified.error,
        hint: "Keys do not need to start with tvsk_. Open https://maker.tavus.io/dev/api-keys, create a key, copy it once (they often show only once), and paste with no spaces.",
      },
      { status: 401 },
    );
  }

  setTavusApiKey(verified.key);
  await clearCachedPal();

  try {
    const pal = await ensureMayaPal();
    return NextResponse.json({
      ok: true,
      configured: true,
      palId: pal.palId,
      faceId: pal.faceId,
      message:
        "Key accepted. Starting living video with a photoreal talking avatar.",
    });
  } catch (error) {
    // Key is valid even if custom PAL creation fails — stock face path still works.
    return NextResponse.json({
      ok: true,
      configured: true,
      warning:
        error instanceof Error
          ? error.message
          : "Key saved. We’ll use Tavus stock face on the next call.",
    });
  }
}
