"use client";

import { FormEvent, useState } from "react";

export function LeadLinkForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    chatUrl: string;
    smsBody: string;
    smsNote?: string;
  } | null>(null);
  const [copied, setCopied] = useState<"link" | "sms" | null>(null);

  async function createLead(sendSms: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          childName,
          childAge,
          notes,
          sendSms,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.chatUrl) {
        setResult({
          chatUrl: "",
          smsBody: "",
          smsNote: data.error || "Could not create lead link",
        });
        return;
      }
      const smsNote = sendSms
        ? data.sms?.sent
          ? "SMS sent via Twilio."
          : data.sms?.reason || data.error || "SMS not sent — copy text manually."
        : undefined;
      setResult({
        chatUrl: data.chatUrl,
        smsBody: data.smsBody,
        smsNote,
      });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void createLead(false);
  }

  async function copy(kind: "link" | "sms") {
    if (!result) return;
    const text = kind === "link" ? result.chatUrl : result.smsBody;
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <form className="lead-form" onSubmit={onSubmit}>
      <div className="lead-grid">
        <label>
          Parent name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Phone (for auto-text)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+14255551212"
          />
        </label>
        <label>
          Child name
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
          />
        </label>
        <label>
          Child age
          <input
            value={childAge}
            onChange={(e) => setChildAge(e.target.value)}
          />
        </label>
      </div>
      <label>
        Notes for Maya
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Filled form on website, lives in Kirkland…"
        />
      </label>
      <div className="result-actions">
        <button type="submit" className="solid-btn" disabled={busy}>
          {busy ? "Working…" : "Create SMS link"}
        </button>
        <button
          type="button"
          className="solid-btn"
          disabled={busy || !phone.trim()}
          onClick={() => void createLead(true)}
        >
          Text Maya now
        </button>
      </div>

      {result?.chatUrl ? (
        <div className="link-result">
          <p>Personalized chat link ready:</p>
          <code>{result.chatUrl}</code>
          {result.smsNote ? <p>{result.smsNote}</p> : null}
          <div className="result-actions">
            <button type="button" onClick={() => void copy("link")}>
              {copied === "link" ? "Copied link" : "Copy link"}
            </button>
            <button type="button" onClick={() => void copy("sms")}>
              {copied === "sms" ? "Copied text" : "Copy SMS text"}
            </button>
            <a href={result.chatUrl}>Open chat</a>
          </div>
        </div>
      ) : result?.smsNote ? (
        <p className="banner warn">{result.smsNote}</p>
      ) : null}
    </form>
  );
}
