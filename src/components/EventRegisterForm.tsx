"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type KidField = { name: string; age: string };

const emptyKid = (): KidField => ({ name: "", age: "" });

export function EventRegisterForm({
  eventId,
  title,
  allowChildren,
}: {
  eventId: string;
  title: string;
  allowChildren: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [kirklandResident, setKirklandResident] = useState("");
  const [residence, setResidence] = useState("");
  const [kids, setKids] = useState<KidField[]>([emptyKid()]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ parent: string; children: string } | null>(null);

  function updateKid(index: number, patch: Partial<KidField>) {
    setKids((current) =>
      current.map((kid, kidIndex) => (kidIndex === index ? { ...kid, ...patch } : kid)),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError("Enter a phone number with at least 10 digits.");
      return;
    }
    if (kirklandResident !== "yes" && kirklandResident !== "no") {
      setError("Choose whether you are a Kirkland resident.");
      return;
    }
    if (kirklandResident === "no" && !residence.trim()) {
      setError("Tell us where you reside.");
      return;
    }
    const payloadKids = allowChildren
      ? kids.map((kid) => ({
          name: kid.name.trim(),
          age: Number(kid.age),
        }))
      : [];
    if (
      allowChildren &&
      payloadKids.some(
        (kid) => !kid.name || !Number.isInteger(kid.age) || kid.age < 1 || kid.age > 18,
      )
    ) {
      setError("Add each child’s name and an age from 1 to 18.");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/events/${eventId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        kirklandResident: kirklandResident === "yes",
        residence: kirklandResident === "no" ? residence.trim() : "",
        kids: payloadKids,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not save that registration.");
      return;
    }
    const childNames = payloadKids.map((kid) => kid.name);
    const children =
      childNames.length === 1
        ? childNames[0]
        : `${childNames.slice(0, -1).join(", ")} and ${childNames.at(-1)}`;
    setDone({
      parent: `${firstName.trim()} ${lastName.trim()}`,
      children,
    });
  }

  if (done) {
    return (
      <div className="event-success" role="status">
        <p className="home-kicker home-kicker-dark">Registration saved</p>
        <h2>You’re registered</h2>
        <p>
          {done.parent}, we saved {allowChildren ? `a spot for ${done.children}` : "your spot"} at{" "}
          {title}. The academy has your email at {email.trim()} and your phone at {phone.trim()}.
        </p>
        <Link className="event-register" href="/events">
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <form className="event-form" onSubmit={onSubmit}>
      <div>
        <p className="home-kicker home-kicker-dark">Register</p>
        <h2>Save your family’s spot</h2>
      </div>
      <div className="event-form-grid">
        <label>
          First name
          <input
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={80}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </label>
      </div>
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={160}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <div className="event-form-grid event-form-contact">
        <label>
          Are you a Kirkland resident?
          <select
            name="kirklandResident"
            required
            value={kirklandResident}
            onChange={(event) => setKirklandResident(event.target.value)}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Phone number
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </div>
      {kirklandResident === "no" ? (
        <label>
          Where do you reside?
          <input
            name="residence"
            required
            maxLength={120}
            value={residence}
            onChange={(event) => setResidence(event.target.value)}
          />
        </label>
      ) : null}
      {allowChildren ? (
      <fieldset className="event-kids">
        <legend>Children</legend>
        {kids.map((kid, index) => (
          <div className="kid-row" key={index}>
            <label>
              Child name
              <input
                required
                maxLength={80}
                value={kid.name}
                onChange={(event) => updateKid(index, { name: event.target.value })}
              />
            </label>
            <label>
              Age
              <input
                required
                inputMode="numeric"
                min={1}
                max={18}
                type="number"
                value={kid.age}
                onChange={(event) => updateKid(index, { age: event.target.value })}
              />
            </label>
            {kids.length > 1 ? (
              <button
                type="button"
                className="event-text-btn"
                onClick={() => setKids((current) => current.filter((_, kidIndex) => kidIndex !== index))}
              >
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {kids.length < 8 ? (
          <button
            type="button"
            className="event-secondary"
            onClick={() => setKids((current) => [...current, emptyKid()])}
          >
            Add another child
          </button>
        ) : null}
      </fieldset>
      ) : null}
      {error ? <p className="maya-error">{error}</p> : null}
      <button className="event-register" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Register"}
      </button>
    </form>
  );
}
