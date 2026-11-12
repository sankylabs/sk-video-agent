import Link from "next/link";
import { EventsFrame } from "@/components/EventsFrame";
import { pageShare, siteConfig } from "@/lib/config";

export const metadata = pageShare({
  title: "Terms · Steamoji Kirkland",
  description: "Event registration and text-message terms for Steamoji Kirkland.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <EventsFrame
      kicker="Steamoji Kirkland"
      title="Terms"
      lede="Registration and text-message terms for Steamoji Kirkland events."
    >
      <article className="legal-doc">
        <p>
          {siteConfig.brand}, {siteConfig.address}. Contact{" "}
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or{" "}
          <a href={`tel:${siteConfig.phone.replace(/\D/g, "")}`}>{siteConfig.phone}</a>.
        </p>
        <h2>Event registration</h2>
        <p>
          Registering holds a spot for the event you chose. A free workshop does not require
          payment. If the event has a spot limit, registration closes when those spots are filled.
          If your plans change, tell us so the spot can be offered to someone else.
        </p>
        <h2>Text messages</h2>
        <p>
          Steamoji Kirkland Event Messages are optional. You opt in by checking the text-message
          box on an event registration form. Checking the box is not required to register.
        </p>
        <ul>
          <li>
            Messages are confirmations and reminders for the event you registered for. Message
            frequency varies.
          </li>
          <li>Message and data rates may apply.</li>
          <li>Reply STOP to cancel. Reply HELP for help.</li>
          <li>
            For help, email {siteConfig.email} or call {siteConfig.phone}.
          </li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
        <p>
          Read the <Link href="/privacy">Privacy Policy</Link> for how we handle your phone number
          and consent.
        </p>
      </article>
    </EventsFrame>
  );
}
