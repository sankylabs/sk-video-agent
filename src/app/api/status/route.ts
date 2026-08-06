import { NextResponse } from "next/server";
import { getOpenAIApiKey, hasLivingVideo } from "@/lib/runtime-secrets";

export async function GET() {
  const livingVideo = hasLivingVideo();
  return NextResponse.json({
    openai: Boolean(getOpenAIApiKey()),
    tavus: livingVideo,
    videoReady: livingVideo,
    livingVideo,
    mode: livingVideo ? "living-video" : "needs-setup",
  });
}
