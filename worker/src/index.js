// PBM Rule Readiness Check: Cloudflare Worker
// POST /start  -> anonymous session from the intake profile (no email needed to ask questions)
// POST /ask    -> answer one question from the knowledge pack via the Claude API
// POST /report -> email the full report (results + every Q&A) and record the lead in the Google Sheet
// GET  /health -> pack version and model, for monitoring
//
// Secrets:  ANTHROPIC_API_KEY, IP_SALT, SHEET_WEBHOOK_URL, SHEET_SECRET,
//           EVAL_TOKEN (optional; lets the eval runner skip rate limits)
// Vars:     MODEL, EFFORT, ALLOWED_ORIGINS, PACK_VERSION, FREE_QUESTIONS, MAX_QUESTIONS,
//           IP_HOURLY_LIMIT, LOG_QUESTIONS, ANTHROPIC_BASE_URL (tests only)
// Bindings: DB (D1)

import PACK from "../../knowledge/pack-v1.1.md";
import { RULES, profileText } from "./prompt.js";
import { renderReport } from "../../report.js";

const PROFILE_KEYS = {
  role: ["sponsor", "advisor", "attorney", "other"],
  type: ["private", "multi", "gov", "church", "unsure"],
  fund: ["self", "level", "fully", "unsure"],
  size: ["small", "mid", "large", "unsure"],
  holder: ["pbm", "tpa", "carrier", "unsure"],
};

function cleanProfile(p) {
  const out = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, allowed] of Object.entries(PROFILE_KEYS)) if (allowed.includes(p[k])) out[k] = p[k];
  for (const k of ["pymonth", "rmonth"]) if (/^(1[0-2]|[1-9]|unsure)$/.test(String(p[k] ?? ""))) out[k] = String(p[k]);
  if (/^(20\d\d|unsure)$/.test(String(p.ryear ?? ""))) out.ryear = String(p.ryear);
  if (/^(30|60|90|120|180|unsure)$/.test(String(p.notice ?? ""))) out.notice = String(p.notice);
  return out;
}

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Eval-Token",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const c = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_VERSION, model: env.MODEL }, 200, c.headers);
    }
    if (req.method !== "POST") return json({ error: "Not found" }, 404, c.headers);
    if (!c.ok) return json({ error: "Origin not allowed" }, 403, c.headers);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400, c.headers);
    }

    const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const ipHash = (await sha256(ip + (env.IP_SALT || ""))).slice(0, 32);
    const now = Date.now();
    // Eval runs send X-Eval-Token to skip per-IP and per-session limits.
    const isEval = !!env.EVAL_TOKEN && req.headers.get("X-Eval-Token") === env.EVAL_TOKEN;

    try {
      if (url.pathname === "/start") return await start(body, env, c.headers, ipHash, now, isEval);
      if (url.pathname === "/report") return await report(body, env, c.headers, ipHash, now, req, isEval);
      if (url.pathname === "/ask") return await ask(body, env, c.headers, ipHash, now, isEval);
    } catch (e) {
      console.error("handler_error", url.pathname, e && e.stack ? e.stack : String(e));
      return json({ error: "Something went wrong. Please try again." }, 500, c.headers);
    }
    return json({ error: "Not found" }, 404, c.headers);
  },
};

const caps = (env) => ({ free: parseInt(env.FREE_QUESTIONS || "5", 10), max: parseInt(env.MAX_QUESTIONS || "10", 10) });

async function start(body, env, headers, ipHash, now, isEval) {
  const profile = cleanProfile(body.profile);
  // Light abuse guard: at most 30 new sessions per IP per hour.
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, now - 3600_000).first();
  if (!isEval && recent && recent.n >= 30) return json({ error: "Too many requests. Please try again later." }, 429, headers);
  const session = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (id, profile, ip_hash, questions, has_email, emails_sent, transcript, created_at) VALUES (?, ?, ?, 0, 0, 0, '[]', ?)")
    .bind(session, JSON.stringify(profile), ipHash, now).run();
  return json({ session, remaining: caps(env).free, unlocked: false }, 200, headers);
}

async function report(body, env, headers, ipHash, now, req, isEval) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "Please enter a valid email address." }, 400, headers);
  const consent = body.consent === true;
  const s = await env.DB.prepare("SELECT id, profile, questions, has_email, emails_sent, transcript FROM sessions WHERE id = ?")
    .bind(String(body.session || "")).first();
  if (!s) return json({ error: "Your session has expired. Please start again.", code: "no_session" }, 401, headers);
  if (!isEval && s.emails_sent >= 3) return json({ error: "This report has already been sent three times.", code: "sent_limit" }, 429, headers);
  const sentRecently = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ip_hash = ? AND last_email_at > ?")
    .bind(ipHash, now - 3600_000).first();
  if (!isEval && sentRecently && sentRecently.n >= 10) return json({ error: "Too many reports from this network. Please try again later." }, 429, headers);

  const profile = JSON.parse(s.profile || "{}");
  const transcript = JSON.parse(s.transcript || "[]");
  const html = renderReport({ profile, transcript, generated: new Date(now), forEmail: true });
  const lead = {
    email, consent, profile,
    questions: transcript.map((t) => t.q),
    source: String(req.headers.get("Origin") || "").slice(0, 100),
    embed: String(body.embed || "").slice(0, 200),
    pack: env.PACK_VERSION ? "v" + env.PACK_VERSION : "",
    report: { subject: "Your PBM Rule Readiness Report", html },
    record: s.emails_sent === 0,   // add a Sheet row only on the first send
  };

  let emailed = false, error = "";
  if (isEval) emailed = true;
  else {
    try {
      if (!env.SHEET_WEBHOOK_URL) throw new Error("SHEET_WEBHOOK_URL not set");
      const r = await fetch(env.SHEET_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, secret: env.SHEET_SECRET || "" }), redirect: "follow",
      });
      const text = await r.text();
      let j = {}; try { j = JSON.parse(text); } catch {}
      emailed = j.ok === true && j.emailed === true;
      if (!emailed) error = `sheet ${r.status}: ${text.slice(0, 200)}`;
    } catch (e) { error = String(e && e.message ? e.message : e); }
    if (error) {
      console.error("report_send_failed", error);
      const { report: _omit, ...keep } = lead;
      await env.DB.prepare("INSERT INTO failed_leads (lead, error, created_at) VALUES (?, ?, ?)")
        .bind(JSON.stringify(keep), error.slice(0, 300), now).run();
    }
  }

  await env.DB.prepare("UPDATE sessions SET has_email = 1, emails_sent = emails_sent + ?, last_email_at = ? WHERE id = ?")
    .bind(emailed ? 1 : 0, now, s.id).run();
  const { max } = caps(env);
  return json({ ok: true, emailed, remaining: Math.max(0, max - s.questions), unlocked: true }, 200, headers);
}

async function ask(body, env, headers, ipHash, now, isEval) {
  const { free, max: full } = caps(env);
  const ipLimit = parseInt(env.IP_HOURLY_LIMIT || "30", 10);
  const sessionId = String(body.session || "");
  const question = String(body.question || "").trim();
  if (!question) return json({ error: "Please type a question." }, 400, headers);
  if (question.length > 500) return json({ error: "Please keep questions under 500 characters." }, 400, headers);

  const s = await env.DB.prepare("SELECT id, profile, questions, has_email, transcript FROM sessions WHERE id = ?").bind(sessionId).first();
  if (!s) return json({ error: "Your session has expired. Please start again.", code: "no_session" }, 401, headers);
  const max = s.has_email ? full : free;
  if (!isEval && s.questions >= max) {
    return s.has_email
      ? json({ error: `You've reached the ${full}-question limit for this session.`, code: "limit", remaining: 0 }, 429, headers)
      : json({ error: `You've used your ${free} free questions. Get your report to unlock ${full - free} more.`, code: "need_email", remaining: 0 }, 429, headers);
  }

  const hourly = await env.DB.prepare("SELECT COUNT(*) AS n FROM asks WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, now - 3600_000).first();
  if (!isEval && hourly && hourly.n >= ipLimit) return json({ error: "Too many questions from this network. Please try again later.", code: "rate" }, 429, headers);

  // The profile from intake is stored server side, so a client can't swap it mid-session.
  const profile = JSON.parse(s.profile || "{}");

  // Prior turns: last 6 messages, strings only, trimmed.
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const messages = [];
  for (const h of history) {
    if (!h || (h.role !== "user" && h.role !== "assistant")) continue;
    const text = String(h.content || "").slice(0, 2500);
    if (!text) continue;
    if (messages.length && messages[messages.length - 1].role === h.role) continue;
    messages.push({ role: h.role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
  messages.push({
    role: "user",
    content: `PROFILE FROM INTAKE\n${profileText(profile)}\n\nQUESTION\n${question}`,
  });

  const t0 = Date.now();
  const res = await fetch((env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.MODEL,
      // Sonnet 5.5 thinks by default; thinking tokens count against max_tokens,
      // so leave room for it. The prompt keeps the visible answer under 250 words.
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: env.EFFORT || "medium" },
      system: [
        { type: "text", text: RULES },
        { type: "text", text: "KNOWLEDGE PACK\n\n" + PACK, cache_control: { type: "ephemeral" } },
      ],
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("anthropic_error", res.status, detail.slice(0, 500));
    return json({ error: "The answer service is busy. Please try again in a minute." }, 502, headers);
  }
  const data = await res.json();
  const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!answer) {
    console.error("empty_answer", data.stop_reason, JSON.stringify((data.content || []).map((b) => b.type)), JSON.stringify(data.usage || {}));
    return json({ error: "No answer came back. Please try again.", ...(isEval ? { debug: { stop: data.stop_reason, blocks: (data.content || []).map((b) => b.type), usage: data.usage } } : {}) }, 502, headers);
  }

  const u = data.usage || {};
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET questions = questions + 1, transcript = ? WHERE id = ?")
      .bind(JSON.stringify([...JSON.parse(s.transcript || "[]"), { q: question, a: answer }].slice(-full)), s.id),
    env.DB.prepare(
      "INSERT INTO asks (session_id, ip_hash, pack_version, model, question, ms, input_tokens, cache_read_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      s.id, ipHash, env.PACK_VERSION || "", env.MODEL || "",
      env.LOG_QUESTIONS === "true" ? question : null,
      Date.now() - t0, u.input_tokens || 0, u.cache_read_input_tokens || 0, u.output_tokens || 0, now
    ),
  ]);

  const out = { answer, pack: env.PACK_VERSION, remaining: Math.max(0, max - s.questions - 1), unlocked: !!s.has_email };
  if (isEval) out.debug = { stop: data.stop_reason, blocks: (data.content || []).map((b) => b.type), usage: u };
  if (data.stop_reason && data.stop_reason !== "end_turn") console.warn("stop_reason", data.stop_reason, JSON.stringify(u));
  return json(out, 200, headers);
}
