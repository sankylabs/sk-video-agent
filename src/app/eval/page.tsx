import Link from "next/link";
import { readLastEvalRun, type EvalLastRun } from "@/lib/eval-results";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Los_Angeles",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SuiteResults({
  title,
  command,
  run,
}: {
  title: string;
  command: string;
  run: EvalLastRun | null;
}) {
  return (
    <section className="eval-suite-block">
      <h2 className="eval-channel">{title}</h2>
      {!run ? (
        <div className="eval-empty">
          <h3>No results yet</h3>
          <p>
            Start the app, then run <code>{command}</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="eval-summary">
            <div
              className={`eval-suite-pill ${run.suitePass ? "is-pass" : "is-fail"}`}
            >
              Suite {run.suitePass ? "PASS" : "FAIL"}
            </div>
            <div className="eval-stats">
              <div className="eval-stat">
                <strong>
                  {run.passed}/{run.total}
                </strong>
                <span>scenarios passed</span>
              </div>
              <div className="eval-stat">
                <strong>{Math.round(run.rate * 100)}%</strong>
                <span>pass rate</span>
              </div>
              <div className="eval-stat">
                <strong>{formatWhen(run.at)}</strong>
                <span>Pacific time</span>
              </div>
              <div className="eval-stat">
                <strong>
                  {run.judge === false ? "off" : "on"} · v{run.version ?? 1}
                </strong>
                <span>LLM judge · suite</span>
              </div>
            </div>
            {run.failedIds?.length ? (
              <p className="eval-failed-ids">
                Failed: {run.failedIds.join(", ")}
              </p>
            ) : null}
          </div>

          <div className="eval-list">
            {run.results.map((r) => (
              <article
                key={`${title}-${r.id}`}
                className={`eval-card ${r.pass ? "is-pass" : "is-fail"}`}
              >
                <header className="eval-card-head">
                  <div>
                    <p className="eval-card-id">{r.id}</p>
                    <h2>{r.name}</h2>
                  </div>
                  <span className="eval-badge">
                    {r.pass ? "PASS" : "FAIL"}
                  </span>
                </header>

                <div className="eval-meta">
                  {r.focus?.length ? (
                    <p>
                      <span>Focus</span> {r.focus.join(" · ")}
                    </p>
                  ) : null}
                  {r.mode ? (
                    <p>
                      <span>Mode</span> {r.mode}
                    </p>
                  ) : null}
                  {r.regexPass != null ? (
                    <p>
                      <span>Regex</span> {r.regexPass ? "ok" : "fail"}
                    </p>
                  ) : null}
                  {r.judge ? (
                    <p>
                      <span>Judge</span>{" "}
                      {r.judge.skipped
                        ? "skipped"
                        : r.judge.pass
                          ? "ok"
                          : "fail"}
                    </p>
                  ) : null}
                </div>

                {r.notes ? <p className="eval-notes">{r.notes}</p> : null}

                {r.error ? <p className="eval-error">{r.error}</p> : null}

                {!r.pass &&
                (r.mustFail?.length ||
                  r.mustNotFail?.length ||
                  r.structural?.length ||
                  (r.judge && !r.judge.pass && !r.judge.skipped)) ? (
                  <div className="eval-fail-detail">
                    {r.mustFail?.length ? (
                      <p>
                        <strong>Missing match:</strong>{" "}
                        {r.mustFail.join(" · ")}
                      </p>
                    ) : null}
                    {r.mustNotFail?.length ? (
                      <p>
                        <strong>Forbidden hit:</strong>{" "}
                        {r.mustNotFail.join(" · ")}
                      </p>
                    ) : null}
                    {r.structural?.length ? (
                      <p>
                        <strong>Structural:</strong>{" "}
                        {r.structural.join(" · ")}
                      </p>
                    ) : null}
                    {r.judge && !r.judge.pass && !r.judge.skipped ? (
                      <p>
                        <strong>LLM judge:</strong>{" "}
                        {(r.judge.reasons || []).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {r.content ? (
                  <blockquote className="eval-reply">
                    <span>Maya reply</span>
                    {r.content}
                  </blockquote>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default async function EvalResultsPage() {
  const [textRun, videoRun] = await Promise.all([
    readLastEvalRun("text"),
    readLastEvalRun("video"),
  ]);

  return (
    <main className="page eval-page">
      <nav className="nav">
        <Link className="brand-mark" href="/">
          {siteConfig.brand}
        </Link>
        <div className="nav-actions">
          <Link className="ghost-link" href="/maya">
            Maya report
          </Link>
          <Link className="ghost-link" href="/send">
            Send a lead link
          </Link>
          <Link className="nav-cta" href="/">
            Home
          </Link>
        </div>
      </nav>

      <header className="eval-head">
        <p className="eyebrow">Evaluation</p>
        <h1>Maya eval results</h1>
        <p className="lede">
          Text chat uses <code>/api/chat</code>. Video uses the live Tavus
          prompt via <code>/api/video-chat</code> (no Tavus room). Re-run with{" "}
          <code>npm run eval</code>, <code>npm run eval:video</code>, or{" "}
          <code>npm run eval:all</code>, then refresh.
        </p>
      </header>

      <SuiteResults
        title="Text chat"
        command="npm run eval"
        run={textRun}
      />
      <SuiteResults
        title="Video Maya"
        command="npm run eval:video"
        run={videoRun}
      />
    </main>
  );
}
