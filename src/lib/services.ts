export const SERVICES_IMAGE_SRC = "/steamoji-kirkland-services.jpg";
export const SERVICES_IMAGE_MARKER = "[SERVICES_IMAGE]";

/** Shared by Tavus PAL + OpenAI text so both brains describe the same four offerings. */
export const steamojiServicesKnowledge = `
## What services we offer (when they ask about services / what we offer / what programs you offer)
This is NOT the same as "what is Steamoji / how it works." For those, use the makerspace + Maker Mindset picture, then pause.
For a services / offerings question, walk these four Kirkland offerings (from our services card). Keep it to a short overview — do not dump every bullet, quote membership dollars, or jump to booking.

1. **Memberships** — year-round after-school makerspace. Come once or twice a week. 60 / 90 / 120 minute sessions. Mon–Fri 2pm–7pm, Sat 10am–5pm. 10 achievement levels, 2-year curriculum. Join anytime.
2. **Camps** — weekly camps, Mon–Fri 9am–3pm. Weekly themes and hands-on STEM projects. Build, explore, and have fun.
3. **VEX Robotics Club** — season August to April. Practice once a week (2-hour sessions), plus Sunday sessions. Saturday competitions at local schools. Build. Code. Compete. Teamwork and problem solving.
4. **Birthday parties** — Saturdays 4pm–6pm. Fun STEM activities and hands-on projects for all ages.

Then pause and let them pick which they want to hear more about.
In TEXT CHAT: include ${SERVICES_IMAGE_MARKER} once in your reply (on its own line) so the parent sees the services graphic. Do not describe the image as an image.
On LIVE VIDEO: describe the four services; do not mention a graphic or say ${SERVICES_IMAGE_MARKER}.
`;

export function isServicesQuestion(text: string) {
  const t = text.toLowerCase().trim();
  if (
    /\b(what is steamoji|what's steamoji|what'?s steamoji about|why steamoji|how (does|do) (steamoji|it|this) work)\b/.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(year.?old|years? old|for (an? |my )?\d{1,2})\b/.test(t) &&
    !/\bservices?\b/.test(t)
  ) {
    return false;
  }
  return (
    /\b(what (services|programs) (do you|you|are|does)|what do you (offer|have)|your services|our services|services do you|offerings|what (all )?do you offer)\b/.test(
      t,
    ) ||
    /\b(list|tell me about) (your |the )?(services|programs|offerings)\b/.test(
      t,
    ) ||
    /^(services|programs|offerings)\??$/.test(t)
  );
}

export function ensureServicesImageMarker(text: string) {
  if (text.includes(SERVICES_IMAGE_MARKER)) return text;
  return `${text.trim()}\n${SERVICES_IMAGE_MARKER}`;
}

export const servicesOverviewReply = `We have four offerings at Steamoji Kirkland: year-round memberships (once or twice a week, 60–120 min), weekly camps (Mon–Fri 9am–3pm), VEX Robotics Club (Aug–April), and Saturday birthday parties (4–6pm). ${SERVICES_IMAGE_MARKER}`;
