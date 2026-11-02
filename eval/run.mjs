// Eval runner for the PBM Rule Readiness Check Q&A.
// Usage:
//   node eval/run.mjs --url https://pbm-readiness.<account>.workers.dev --token <EVAL_TOKEN> [--only A01,U04] [--concurrency 3]
// Writes eval/results/<timestamp>.json and .md. Automatic checks are a first pass;
// counsel reviews the answers in the .md report.

import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const URL_ = args.url;
const TOKEN = args.token || "";
const ORIGIN = args.origin || "https://nautilus-health.github.io";
const CONC = parseInt(args.concurrency || "3", 10);
if (!URL_) { console.error("--url is required"); process.exit(1); }

const here = path.dirname(new URL(import.meta.url).pathname);
const spec = JSON.parse(fs.readFileSync(path.join(here, "questions.json"), "utf8"));
let qs = spec.questions;
if (args.only) { const ids = new Set(args.only.split(",")); qs = qs.filter((q) => ids.has(q.id)); }

const re = (p) => new RegExp(p.replace(/\(\?i\)/g, ""), "im");
const H = { "Content-Type": "application/json", Origin: ORIGIN, ...(TOKEN ? { "X-Eval-Token": TOKEN } : {}) };

async function post(p, body) {
  const r = await fetch(URL_ + p, { method: "POST", headers: H, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, ...j };
}

async function runOne(q) {
  const profile = spec.profiles[q.profile];
  const lead = await post("/start", { profile });
  if (!lead.session) return { ...q, ok: false, error: `start failed: ${lead.status} ${lead.error || ""}` };
  const t0 = Date.now();
  const a = await post("/ask", { session: lead.session, question: q.question, history: [] });
  const ms = Date.now() - t0;
  if (!a.answer) return { ...q, ok: false, error: `ask failed: ${a.status} ${a.error || ""}`, ms };
  const fails = [];
  for (const p of [...q.must, ...spec.always.must]) if (!re(p).test(a.answer)) fails.push(`missing /${p}/`);
  for (const p of [...q.must_not, ...spec.always.must_not]) if (re(p).test(a.answer)) fails.push(`forbidden /${p}/`);
  const words = a.answer.split(/\s+/).length;
  if (words > 260) fails.push(`too long (${words} words)`);
  return { ...q, ok: fails.length === 0, fails, answer: a.answer, words, ms, pack: a.pack };
}

const results = [];
let i = 0;
async function worker() {
  while (i < qs.length) {
    const q = qs[i++];
    const r = await runOne(q).catch((e) => ({ ...q, ok: false, error: String(e) }));
    results.push(r);
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.error || (r.fails || []).join("; ")}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));

const pass = results.filter((r) => r.ok).length;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${stamp}.json`), JSON.stringify({ url: URL_, pass, total: results.length, results }, null, 1));

const md = [
  `# Readiness Check eval: ${stamp}`,
  ``,
  `Automatic checks: **${pass} of ${results.length} passed** (${Math.round((100 * pass) / results.length)}%). Launch bar: 95%, and zero answers that state an open item as settled (human review).`,
  ``,
  `Reviewer: for each answer, mark Correct / Needs fix, and note any statement that goes beyond the knowledge pack.`,
  ``,
  ...results.map((r) => [
    `---`,
    `## ${r.id} ${r.ok ? "PASS" : "FAIL"} (profile: ${r.profile})`,
    `**Q:** ${r.question}`,
    ``,
    `**Expected:** ${r.expect}`,
    r.fails && r.fails.length ? `\n**Automatic check failures:** ${r.fails.join("; ")}` : "",
    r.error ? `\n**Error:** ${r.error}` : "",
    ``,
    r.answer ? r.answer.split("\n").map((l) => "> " + l).join("\n") : "",
    ``,
    `Reviewer: [ ] Correct  [ ] Needs fix  Notes:`,
    ``,
  ].join("\n")),
].join("\n");
fs.writeFileSync(path.join(outDir, `${stamp}.md`), md);
console.log(`\n${pass}/${results.length} passed. Report: eval/results/${stamp}.md`);
process.exit(pass === results.length ? 0 : 1);
