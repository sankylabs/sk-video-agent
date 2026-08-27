export const siteConfig = {
  brand: "Steamoji Kirkland",
  personaName: "Maya",
  personaTitle: "AI Enrollment Advisor",
  tagline: "Kids stay engaged. Parents see progress.",
  mission:
    "Train the next generation of Master Makers — mentoring kids to develop a Maker Mindset through hands-on STEM, creativity, adaptability, and resilience.",
  phone: "(425) 305-5642",
  email: "kirkland@steamoji.com",
  address: "355 Kirkland Avenue, Kirkland, WA 98033",
  freeSessionUrl: "https://kirkland.steamoji.com/book-a-free-session",
  websiteUrl: "https://www.steamoji.com/wa-kirkland",
  campsUrl: "https://steamoji.com/camps/wa-kirkland",
  hours: "Mon–Fri 2pm–7pm · Sat 10am–7pm · Sun closed",
  ages: "Ages 5–14",
} as const;

export function trialUrl(leadId?: string) {
  const url = new URL(siteConfig.freeSessionUrl);
  if (leadId) url.searchParams.set("utm_content", leadId);
  url.searchParams.set("utm_source", "maya-agent");
  url.searchParams.set("utm_medium", "video-chat");
  return url.toString();
}
