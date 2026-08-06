import { siteConfig } from "./config";

/** Lightweight fallback when OPENAI_API_KEY is not set (text helpers only). */
export function demoReply(userText: string): string {
  const t = userText.toLowerCase();

  if (/(price|cost|how much|tuition|fee|membership)/.test(t)) {
    return `Our main memberships are Annual at $349/month (8 hrs + 4 bonus hrs, priority booking), Monthly at $399/month (8 hrs), and Lite at $225/month (4 hrs). All plus tax, no registration fees; siblings get $50/month off. Most families start with a free session so your child can try the space first: ${siteConfig.freeSessionUrl}`;
  }

  if (/(camp|summer|spring)/.test(t)) {
    return `For camps, check available weeks on our Kirkland page and book there: ${siteConfig.websiteUrl}. Half-day and full-day options are typically around $349–$599 for a Mon–Fri week. If you’re open to after-school membership too, I can also get you a free session/tour.`;
  }

  if (/(age|years? old|grade)/.test(t)) {
    return `We serve ${siteConfig.ages}. Journey paths differ for younger vs older makers — no experience needed. Kids start with age-right projects in coding, robotics, and 3D making. A free session is the easiest way to see the fit: ${siteConfig.freeSessionUrl}`;
  }

  if (/(far|distance|commute|woodinville|clyde|redmond|bellevue)/.test(t)) {
    return `Kirkland families are the easiest fit. Clyde Hill / Woodinville can work if you can come 1–2x/week. Farther out, many families do a weekend 2-hour visit or start on Lite (4 hrs/month). Want to book a free session and see the academy?`;
  }

  if (/(schedule|busy|twice|commit)/.test(t)) {
    return `Schedules are the #1 concern — that’s why booking is flexible (60/90/120 min). Some families do two 90-min weekday sessions; others do one weekend 2-hour block. Ideal pace is 1–2x/week. A free session is the easiest first step.`;
  }

  if (/(book|sign up|trial|free session|tour|enroll)/.test(t)) {
    return `Perfect — grab a free session here: ${siteConfig.freeSessionUrl}. Or call ${siteConfig.phone}. Once your child tries a project, we can talk Annual vs Monthly vs Lite.`;
  }

  return `Steamoji Kirkland is a hands-on maker academy for ${siteConfig.ages} — coding, robotics, 3D printing, engineering, and digital arts. Kids level up on a Journey to Master Maker, and you get Parent App updates with a Maker Moment video after every session. The best first step is a free session so your child can try a real project: ${siteConfig.freeSessionUrl}`;
}
