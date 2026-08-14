import { NextResponse } from "next/server";
import { isGhlCalendarEnabled, getGhlConfig } from "@/lib/ghl";
import { getOpenAIApiKey, hasLivingVideo } from "@/lib/runtime-secrets";

export async function GET() {
  const livingVideo = hasLivingVideo();
  const ghl = isGhlCalendarEnabled();
  return NextResponse.json({
    openai: Boolean(getOpenAIApiKey()),
    tavus: livingVideo,
    videoReady: livingVideo,
    livingVideo,
    ghlCalendar: ghl,
    ghlCalendarId: ghl ? getGhlConfig()?.calendarId : null,
    mode: livingVideo ? "living-video" : "needs-setup",
  });
}
