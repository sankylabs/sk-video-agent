"use client";

import { FormEvent, useState, type ReactNode } from "react";

export function DirectorGate({
  authed,
  needsSetup,
  openLocally,
  children,
}: {
  authed: boolean;
  needsSetup: boolean;
  openLocally: boolean;
  children: ReactNode;
}) {
  const [secret, setSecret] = useState("");
  const [authError, setAuthError] = useState("");
  const [pending, setPending] = useState(false);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setPending(true);
    const res = await fetch("/api/events/director/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    setPending(false);
    if (!res.ok) {
      setAuthError("That password didn’t match EVENTS_DIRECTOR_SECRET.");
      return;
    }
    window.location.reload();
  }

  if (!authed) {
    return (
      <form className="event-login" onSubmit={onLogin}>
        <p className="home-kicker home-kicker-dark">Director</p>
        <h2>Academy access</h2>
        <p>
          {needsSetup
            ? "Set EVENTS_DIRECTOR_SECRET on the server, then use that password here."
            : "Enter the director password to add events and see registrations."}
        </p>
        <label>
          Password
          <input
            type="password"
            value={secret}
            onChange={(input) => setSecret(input.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {authError ? <p className="maya-error">{authError}</p> : null}
        <button className="event-register" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Open director console"}
        </button>
      </form>
    );
  }

  return (
    <>
      {openLocally ? (
        <p className="director-note">
          Local preview is open because EVENTS_DIRECTOR_SECRET is not set. Set that
          password before this page is public.
        </p>
      ) : null}
      {children}
    </>
  );
}
