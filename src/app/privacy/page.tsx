import Link from "next/link";
import { EventsFrame } from "@/components/EventsFrame";
import { pageShare, siteConfig } from "@/lib/config";

export const metadata = pageShare({
  title: "Privacy Policy · Steamoji Kirkland",
  description: "How Steamoji Kirkland uses registration details and text-message consent.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <EventsFrame
      kicker="Steamoji Kirkland"
      title="Privacy Policy"
      lede="How we use the details you give us when you register for an event."
    >
      <article className="legal-doc">
        <p>
          {siteConfig.brand} is at {siteConfig.address}. Questions about this policy:{" "}
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or{" "}
          <a href={`tel:${siteConfig.phone.replace(/\D/g, "")}`}>{siteConfig.phone}</a>.
        </p>
        <h2>What we collect</h2>
        <p>When you register for an event, we collect:</p>
        <ul>
          <li>Your name, email address, and phone number</li>
          <li>Whether you live in Kirkland, and where you reside if you do not</li>
          <li>Children’s names and ages, when the event asks for them</li>
          <li>Whether you agreed to receive text messages</li>
        </ul>
        <h2>How we use it</h2>
        <p>
          We use this information to hold your spot, email you about that event, and run the
          workshop. We text you only if you check the text-message box on the registration form.
          Those texts are confirmations and reminders for the event you registered for.
        </p>
        <h2>Text messages</h2>
        <p>
          No mobile information will be shared with third parties or affiliates for marketing or
          promotional purposes. Text messaging originator opt-in data and consent will not be
          shared with any third parties.
        </p>
        <p>
          We use a messaging service to deliver the texts you requested. We do not sell phone
          numbers. Reply STOP to cancel texts and HELP for help. You can also email{" "}
          {siteConfig.email}.
        </p>
        <h2>How long we keep it</h2>
        <p>
          We keep registration details for the event and our records of who attended. You can ask
          us to delete your information by emailing {siteConfig.email}.
        </p>
        <p>
          See the <Link href="/terms">Terms</Link> for how event text messages work.
        </p>
      </article>
    </EventsFrame>
  );
}
