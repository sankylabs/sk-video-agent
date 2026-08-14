#!/usr/bin/env node
/**
 * Stricter Maya eval harness: regex + structural checks + optional LLM judge.
 *
 *   npm run eval
 *   node evals/run.mjs --base http://127.0.0.1:3000
 *   node evals/run.mjs --no-judge   # skip LLM judge
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const baseUrl = arg("--base", "http://127.0.0.1:3000").replace(/\/$/, "");
const useJudge = !process.argv.includes("--no-judge");
const criteria = JSON.parse(
  fs.readFileSync(path.join(__dirname, "criteria.json"), "utf8"),
);
const { scenarios } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "scenarios.json"), "utf8"),
);

function loadOpenAIKey() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return process.env.OPENAI_API_KEY || "";
  const t = fs.readFileSync(envPath, "utf8");
  const m = t.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
  if (!m) return process.env.OPENAI_API_KEY || "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function toRegExp(pattern) {
  let source = pattern;
  let flags = "";
  if (source.startsWith("(?i)")) {
    source = source.slice(4);
    flags = "i";
  }
  return new RegExp(source, flags);
}

function missingMatches(text, patterns) {
  const hits = [];
  for (const p of patterns || []) {
    if (!toRegExp(p).test(text)) hits.push(p);
  }
  return hits;
}

function forbiddenHits(text, patterns) {
  const hits = [];
  for (const p of patterns || []) {
    if (toRegExp(p).test(text)) hits.push(p);
  }
  return hits;
}

function countQuestions(text) {
  return (text.match(/\?/g) || []).length;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function createLead(lead) {
  if (!lead) return null;
  const res = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: lead.name || "Eval Parent",
      childName: lead.childName || "",
      childAge: lead.childAge || "",
      notes: lead.notes || "eval harness",
      phone: "",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.lead?.id || data.id || null;
}

async function chat(messages, leadId) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, leadId: leadId || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    content: data.content || "",
    mode: data.mode || "",
  };
}

async function greeting(lead) {
  const res = await fetch(`${baseUrl}/api/greeting`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(lead || {}),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    content: data.content || "",
    mode: data.source || "greeting",
  };
}

function structuralIssues(content, expect) {
  const issues = [];
  if (expect.maxQuestions != null) {
    const q = countQuestions(content);
    if (q > expect.maxQuestions) {
      issues.push(`maxQuestions ${q}>${expect.maxQuestions}`);
    }
  }
  if (expect.maxWords != null) {
    const w = countWords(content);
    if (w > expect.maxWords) {
      issues.push(`maxWords ${w}>${expect.maxWords}`);
    }
  }
  return issues;
}

async function llmJudge({ scenario, content, transcript }) {
  const key = loadOpenAIKey();
  if (!key) {
    return {
      pass: true,
      skipped: true,
      reasons: ["LLM judge skipped — no OPENAI_API_KEY"],
    };
  }

  const focus = (scenario.focus || []).join(", ");
  const notes = scenario.expect?.notes || "";
  const system = `You are a strict QA judge for Maya, Steamoji Kirkland's AI enrollment advisor.
Score ONLY the assistant's latest reply against the scenario expectations.
Be harsh on: trial/booking before qualify, Saturday/day spam, membership dollar amounts, interest quizzes, drop-off allowed, inventing facts, re-asking known age/location.
Return JSON only: {"pass":boolean,"reasons":string[]}
pass=false if any critical expectation is violated. reasons should be short.`;

  const user = `Scenario: ${scenario.id} ${scenario.name}
Focus criteria: ${focus}
Expectation notes: ${notes}
Transcript:
${transcript}
Latest assistant reply:
"""
${content}
"""`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return {
      pass: false,
      reasons: [`LLM judge HTTP ${res.status}: ${err.slice(0, 160)}`],
    };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      pass: Boolean(parsed.pass),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map(String)
        : [String(parsed.reasons || "")].filter(Boolean),
    };
  } catch {
    return { pass: false, reasons: [`LLM judge bad JSON: ${raw.slice(0, 160)}`] };
  }
}

function transcriptOf(messages, reply) {
  const lines = (messages || []).map(
    (m) => `${m.role.toUpperCase()}: ${m.content}`,
  );
  lines.push(`ASSISTANT: ${reply}`);
  return lines.join("\n");
}

async function runScenario(s) {
  let leadId = null;
  if (s.lead && !s.greetingOnly) {
    leadId = await createLead(s.lead);
  }

  let content = "";
  let mode = "";
  let status = 0;

  if (s.greetingOnly) {
    const r = await greeting(s.lead || {});
    content = r.content;
    mode = r.mode;
    status = r.status;
  } else {
    const r = await chat(s.messages, leadId);
    content = r.content;
    mode = r.mode;
    status = r.status;
  }

  const expect = s.expect || {};
  const mustFailAll = missingMatches(content, expect.mustMatchAll);
  // legacy alias
  const mustFailLegacy = missingMatches(content, expect.mustMatch);
  const mustFailAny =
    expect.mustMatchAny?.length &&
    expect.mustMatchAny.every((p) => !toRegExp(p).test(content))
      ? expect.mustMatchAny
      : [];
  const mustNotFail = forbiddenHits(content, expect.mustNotMatch);
  const structural = structuralIssues(content, expect);

  let judge = null;
  const wantJudge = useJudge && expect.llmJudge;
  if (wantJudge) {
    judge = await llmJudge({
      scenario: s,
      content,
      transcript: transcriptOf(s.messages, content),
    });
  }

  const regexPass =
    status < 400 &&
    mustFailAll.length === 0 &&
    mustFailLegacy.length === 0 &&
    mustFailAny.length === 0 &&
    mustNotFail.length === 0 &&
    structural.length === 0;

  const judgePass = !wantJudge || !judge || judge.skipped || judge.pass;
  const pass = regexPass && judgePass;

  return {
    id: s.id,
    name: s.name,
    focus: s.focus,
    pass,
    regexPass,
    judgePass,
    mode,
    status,
    content,
    mustFail: [...mustFailAll, ...mustFailLegacy, ...mustFailAny],
    mustNotFail,
    structural,
    judge,
    notes: expect.notes || "",
  };
}

async function main() {
  console.log(`Maya eval v2 → ${baseUrl}`);
  console.log(
    `Criteria v${criteria.version} · pass bar ${(criteria.passBar * 100).toFixed(0)}% · LLM judge ${useJudge ? "ON" : "OFF"}\n`,
  );

  const health = await fetch(`${baseUrl}/api/status`).catch(() => null);
  if (!health?.ok) {
    console.error(
      "Server not reachable. Start: npm run dev -- --hostname 127.0.0.1 --port 3000",
    );
    process.exit(1);
  }

  const results = [];
  for (const s of scenarios) {
    process.stdout.write(`${s.id} ${s.name} … `);
    try {
      const r = await runScenario(s);
      results.push(r);
      console.log(r.pass ? "PASS" : "FAIL");
      if (!r.pass) {
        if (r.mustFail?.length)
          console.log(`  missing: ${r.mustFail.join(" | ")}`);
        if (r.mustNotFail?.length)
          console.log(`  forbidden: ${r.mustNotFail.join(" | ")}`);
        if (r.structural?.length)
          console.log(`  structural: ${r.structural.join(" | ")}`);
        if (r.judge && !r.judge.pass && !r.judge.skipped)
          console.log(`  judge: ${(r.judge.reasons || []).join(" · ")}`);
        console.log(
          `  reply: ${(r.content || "").slice(0, 240).replace(/\n/g, " ")}`,
        );
      } else if (r.judge?.reasons?.length && !r.judge.skipped) {
        // keep quiet on pass unless useful — skip
      }
    } catch (e) {
      results.push({
        id: s.id,
        name: s.name,
        pass: false,
        error: String(e),
      });
      console.log("ERROR");
      console.log(`  ${e}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const rate = total ? passed / total : 0;
  const suitePass = rate >= criteria.passBar;
  const failed = results.filter((r) => !r.pass);

  const outDir = path.join(root, ".data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "eval-last.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        version: 2,
        baseUrl,
        judge: useJudge,
        passed,
        total,
        rate,
        suitePass,
        failedIds: failed.map((r) => r.id),
        results,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n${passed}/${total} passed (${(rate * 100).toFixed(0)}%) · suite ${suitePass ? "PASS" : "FAIL"}`,
  );
  if (failed.length) {
    console.log(`Failed: ${failed.map((r) => r.id).join(", ")}`);
  }
  console.log(`Wrote ${outPath}`);
  console.log(`View: ${baseUrl}/eval`);
  process.exit(suitePass ? 0 : 2);
}

main();
