// PBM Rule Readiness Check: results logic.
// Pure functions, no DOM. Used by the page (to show results) and by the Worker
// (to build the emailed report), so both always say the same thing.
// Every rule here traces to the Nautilus Fiduciary Action Checklist.

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const QUESTIONS = [
  { id: "role", label: "Which best describes you?", opts: [["sponsor","Plan sponsor or fiduciary"],["advisor","Broker or consultant"],["attorney","Attorney"],["other","Other"]] },
  { id: "type", label: "What kind of employer sponsors the plan?", opts: [["private","Private employer"],["multi","Multiemployer (union) plan"],["gov","Government"],["church","Church"],["unsure","Not sure"]] },
  { id: "fund", label: "How is the medical plan funded?", opts: [["self","Self-funded"],["level","Level-funded"],["fully","Fully insured"],["unsure","Not sure"]] },
  { id: "size", label: "How many employees or participants?", opts: [["small","Under 100"],["mid","100 to 499"],["large","500 or more"],["unsure","Not sure"]] },
  { id: "pymonth", label: "What month does the plan year start?", kind: "month" },
  { id: "renewal", label: "When does the PBM contract next renew?", kind: "renewal" },
  { id: "holder", label: "Who holds the PBM contract?", opts: [["pbm","The plan, directly with the PBM"],["tpa","A TPA"],["carrier","The insurance carrier"],["unsure","Not sure"]] },
];

const CAT = {
  FULL: { label: "ERISA plan, self-funded or level-funded, 100 or more participants",
    dol: "Applies in full. Detailed initial disclosures, semiannual or quarterly reports, an annual audit right, and machine-readable data.",
    pass: "Applies.", rep: "Detailed report." },
  SMALL: { label: "ERISA plan, self-funded or level-funded, under 100 participants",
    dol: "The detailed rule doesn't apply. General statutory disclosures are still required.",
    pass: "Applies.", rep: "Summary report." },
  FI: { label: "ERISA plan, fully insured",
    dol: "The detailed rule doesn't apply. General statutory disclosures are still required.",
    pass: "Applies through the insurer.", rep: "Summary report. Plans with 100 or more participants may opt in to the detailed report." },
  NON: { label: "Government or church plan (not covered by ERISA)",
    dol: "Doesn't apply. Contract for the same terms.",
    pass: "Doesn't apply. Contract for the same terms.", rep: "Applies." },
};
const ORDER = ["FULL", "FI", "SMALL", "NON"];

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d || 1));
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
export const fmt = (dt) => `${SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
export const fmtLong = (dt) => `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
function firstOnOrAfter(month, threshold) {
  for (let y = 2026; y <= 2032; y++) { const c = D(y, month, 1); if (c >= threshold) return c; }
  return null;
}
const DOL_START = D(2027, 7, 1), CAA_START = D(2028, 8, 3);

export function todayUTC(now = new Date()) { return D(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()); }

export function voice(p) {
  return (p.role === "advisor" || p.role === "attorney")
    ? { your: "your client's", Your: "Your client's", You: "Your client", you: "your client", are: "is" }
    : { your: "your", Your: "Your", You: "You", you: "you", are: "are" };
}

function categories(p) {
  const types = p.type === "unsure" ? ["private", "gov"] : [p.type];
  const funds = p.fund === "unsure" ? ["self", "fully"] : [p.fund];
  const sizes = p.size === "unsure" ? ["mid", "small"] : [p.size];
  const found = {};
  for (const t of types) for (const f of funds) for (const z of sizes) {
    found[(t === "gov" || t === "church") ? "NON" : f === "fully" ? "FI" : z === "small" ? "SMALL" : "FULL"] = true;
  }
  return ORDER.filter((c) => found[c]).slice(0, 2);
}

// Profile in plain words, for the report and the Sheet.
export function describe(p) {
  const q = Object.fromEntries(QUESTIONS.filter((x) => x.opts).map((x) => [x.id, Object.fromEntries(x.opts)]));
  const m = (v) => (/^\d+$/.test(v || "") ? MONTHS[+v - 1] : "Not sure");
  return [
    ["You are", q.role[p.role] || "Not given"],
    ["Plan sponsor", q.type[p.type] || "Not given"],
    ["Funding", q.fund[p.fund] || "Not given"],
    ["Size", q.size[p.size] || "Not given"],
    ["Plan year starts", m(p.pymonth)],
    ["Next PBM renewal", /^\d+$/.test(p.rmonth || "") && /^\d{4}$/.test(p.ryear || "") ? `${m(p.rmonth)} ${p.ryear}` : "Not sure"],
    ["Auto-renewal notice", /^\d+$/.test(p.notice || "") ? `${p.notice} days` : "Not sure"],
    ["Contract held by", q.holder[p.holder] || "Not given"],
  ];
}

// The whole result, as data. Renderers add the markup.
export function compute(p, today = todayUTC()) {
  const Y = voice(p);
  const list = categories(p);
  const primary = list[0];
  const unsure = list.length > 1;

  const pm = /^\d+$/.test(p.pymonth || "") ? +p.pymonth : null;
  const dolFirst = pm ? firstOnOrAfter(pm, DOL_START) : null;
  const caaFirst = pm ? firstOnOrAfter(pm, CAA_START) : null;
  const renewal = /^\d+$/.test(p.rmonth || "") && /^\d{4}$/.test(p.ryear || "") ? D(+p.ryear, +p.rmonth, 1) : null;
  const notice = /^\d+$/.test(p.notice || "") ? +p.notice : null;
  const autoDeadline = renewal && notice ? addDays(renewal, -notice) : null;
  const dolApplies = primary === "FULL";
  const initialDue = dolApplies && renewal && dolFirst && renewal >= dolFirst ? addDays(renewal, -90) : null;
  const earlier = [autoDeadline, initialDue].filter(Boolean).sort((a, b) => a - b)[0] || null;
  const reviewBy = earlier ? addDays(earlier, -60) : null;

  // Headline: the one sentence that matters most.
  let headline;
  if (primary === "FULL") headline = dolFirst
    ? `The detailed DOL rule applies to ${Y.your} plan starting ${fmtLong(dolFirst)}.`
    : `The detailed DOL rule applies to ${Y.your} plan, starting with the first plan year that begins on or after July 1, 2027.`;
  else if (primary === "SMALL") headline = `${Y.Your} plan is under the 100-participant line, so the detailed rule doesn't apply, but ${Y.you} ${Y.are} owed the general statutory disclosures now.`;
  else if (primary === "FI") headline = `As a fully insured plan, ${Y.your} plan is outside the detailed rule, but the insurer still owes ${Y.you} the general statutory disclosures.`;
  else headline = `Federal PBM rules don't cover ${p.type === "church" ? "church" : "government"} plans, so ${Y.your} PBM contract has to provide the same protections.`;
  if (unsure) headline = `${Y.Your} answers fit more than one profile. Most likely: ${CAT[primary].label.toLowerCase()}.`;

  const dates = [];
  if (primary !== "NON" && dolFirst) dates.push({ k: "First plan year under the DOL rule", d: dolFirst, note: primary === "FULL" ? "" : "Detailed rule doesn't apply to this profile" });
  if (primary !== "NON" && caaFirst) dates.push({ k: "First plan year under CAA 2026", d: caaFirst, note: "" });
  if (initialDue) dates.push({ k: "Initial disclosure due", d: initialDue, note: "90 days before renewal", track: true });
  if (autoDeadline) dates.push({ k: "Auto-renewal deadline", d: autoDeadline, note: `${notice}-day notice window`, track: true });
  if (reviewBy) dates.push({ k: "Start contract review by", d: reviewBy, note: "60 days before the earlier deadline", track: true });
  for (const x of dates) { x.v = fmt(x.d); x.past = !!(x.track && x.d < today); }

  const upcoming = dates.filter((x) => x.track && x.d >= today).sort((a, b) => a.d - b.d)[0];
  const NEXT = { "Start contract review by": "Start your contract review by", "Initial disclosure due": "Your PBM's initial disclosure is due", "Auto-renewal deadline": "Your auto-renewal notice deadline is" };
  const nextDeadline = upcoming ? `${NEXT[upcoming.k] || upcoming.k} ${fmtLong(upcoming.d)}.` : null;

  const missing = [];
  if (!pm) missing.push("plan year start month");
  if (!renewal) missing.push("renewal date");
  if (!notice) missing.push("auto-renewal notice window");

  const flags = [];
  if (autoDeadline && autoDeadline >= today && autoDeadline - today <= 120 * 864e5)
    flags.push({ urgent: true, title: "Act now.", body: `The auto-renewal notice deadline is ${fmt(autoDeadline)}, within 120 days. Miss it and the current terms roll forward.` });
  if (autoDeadline && autoDeadline < today && renewal >= today)
    flags.push({ urgent: true, title: "The auto-renewal notice window may have closed.", body: "Check the contract now for any remaining exit or amendment rights." });
  if (renewal && renewal < today)
    flags.push({ title: "That renewal date has passed.", body: "Enter the next renewal date for accurate deadlines." });
  if (dolApplies && renewal && dolFirst && renewal < dolFirst && renewal >= today)
    flags.push({ title: `${Y.Your} next renewal comes before the detailed rule.`, body: `${Y.You} ${Y.are} still owed statutory disclosures now. Plan for the full disclosures at the renewal after.` });
  if (renewal && renewal > CAA_START && primary !== "NON")
    flags.push({ title: "The current contract runs past August 3, 2028.", body: "CAA 2026 pass-through requirements attach to plan years starting on or after that date. Whether an existing contract must be amended mid-term is pending counsel confirmation. See the August 2028 scenario table in the checklist." });
  if (p.holder === "tpa" || p.holder === "carrier")
    flags.push({ title: `The contract is held through ${p.holder === "tpa" ? "the TPA" : "the carrier"}.`, body: `That entity owes ${Y.you} the disclosures, even if another company runs the PBM.` });
  if (p.holder === "unsure")
    flags.push({ title: "Find out who holds the PBM contract.", body: `Whoever holds it owes ${Y.you} the disclosures.` });

  return {
    voice: Y, primary, unsure, headline, nextDeadline,
    rows: list.map((c) => CAT[c]),
    dates, missing, flags,
    actions: actions(p, primary, { reviewBy, autoDeadline, initialDue, dolFirst, caaFirst, unsure }, today),
  };
}

function actions(p, c, d, today) {
  const Y = voice(p);
  const now = "Now";
  const by = (dt, fallback) => (!dt ? fallback : dt < today ? `Now (target date ${fmt(dt)} has passed)` : `By ${fmt(dt)}`);
  const a = [];
  const add = (when, title, body) => a.push({ when, title, body });
  if (c === "NON") {
    add(now, `Pull ${Y.your} PBM contract and every amendment.`, "Federal rules won't do this work for a government or church plan. The contract is the only protection.");
    add(by(d.reviewBy, "Before the next renewal"), "Run a Contract X-Ray.", "Get a Negotiation Guide that compares the contract to the DOL rule and CAA 2026 standards.");
    add(by(d.autoDeadline, "Check the contract"), "Calendar the auto-renewal notice deadline.", "That date is the leverage point for new terms.");
    add("At renewal", "Contract for the same disclosures.", "Ask for initial and semiannual compensation disclosures, in machine-readable form.");
    add("At renewal", "Contract for an annual audit right", "with an auditor the plan chooses and claims-level data.");
    add("At renewal", "Contract for full pass-through", "of rebates and other manufacturer payments to the plan.");
    return a;
  }
  add(now, `Pull ${Y.your} PBM contract and every amendment.`, "Include any contract held by a TPA or carrier on the plan's behalf.");
  add(by(d.reviewBy, "Before the next renewal"), "Run a Contract X-Ray.", "Get a Negotiation Guide that scores the contract against the DOL final rule and CAA 2026.");
  if (c === "FULL") {
    add(by(d.autoDeadline, "Check the contract"), "Calendar the auto-renewal notice deadline.", "Missing it rolls the current terms forward.");
    add(now, `Request the statutory disclosures ${Y.you} ${Y.are} owed today.`, "The general 408(b)(2) requirement already applies. The DOL's temporary enforcement policy covers the gap until the detailed rule starts.");
    add(by(d.initialDue, d.dolFirst ? `From ${fmt(d.dolFirst)}` : "When the rule applies"), "Review the initial disclosure and document the decision.", "A documented review supports the rule's exemption for a fiduciary who acts in good faith on a disclosure that turns out to be wrong.");
    add(d.dolFirst ? `From ${fmt(d.dolFirst)}` : "When the rule applies", "Choose the plan's auditor.", "The rule gives the plan an annual audit right, with an auditor the plan selects.");
  } else if (c === "FI") {
    add(now, "Ask the insurer for the general statutory disclosures.", "The detailed rule doesn't cover fully insured plans, but the statute still does.");
    add(by(d.caaFirst, "By August 2028"), "Ask how CAA 2026 pass-through will reach the plan.", "Get the answer in writing at renewal.");
    add(by(d.autoDeadline, "Check the contract"), "Calendar the renewal notice deadline", "and use it to price a self-funded option.");
  } else if (c === "SMALL") {
    add(now, "Request the general statutory disclosures.", "The detailed rule starts at 100 participants, but the statute applies now.");
    add(by(d.autoDeadline, "Check the contract"), "Calendar the auto-renewal notice deadline.", "Missing it rolls the current terms forward.");
    add(by(d.caaFirst, "By August 2028"), "Plan for CAA 2026 pass-through.", "Ask the PBM how rebates will reach the plan.");
  }
  if (d.unsure) a.splice(1, 0, { when: now, title: "Confirm the plan's profile.", body: `Funding, size and sponsor type decide which rules apply. Check the plan document or ask ${p.role === "advisor" ? "the plan sponsor" : "your broker"}.` });
  const key = (lbl) => {
    if (lbl.indexOf("Now") === 0) return 0;
    const m = lbl.match(/([A-Z][a-z]{2}) (\d+), (\d{4})/);
    return m ? D(+m[3], SHORT.indexOf(m[1]) + 1, +m[2]).getTime() : 9e15;
  };
  return a.map((x, i) => [x, i]).sort((x, y) => key(x[0].when) - key(y[0].when) || x[1] - y[1]).map((x) => x[0]).slice(0, 6);
}

export function suggestions(primary) {
  if (primary === "NON") return ["Which disclosure and audit terms should we put in our PBM contract?", "Do the CAA 2026 PBM reports apply to our plan?", "How do we handle a PBM that refuses these terms?"];
  if (primary === "FI") return ["What disclosures is our insurer required to give us now?", "How will the 2028 rebate pass-through reach a fully insured plan?", "Should we consider moving to self-funding?"];
  if (primary === "SMALL") return ["What disclosures are we owed if we're under 100?", "Does the 2028 rebate pass-through apply to us?", "What should we ask our PBM for at renewal?"];
  return ["When is our PBM's first detailed disclosure due?", "What audit terms should we insist on at renewal?", "Does the August 2028 pass-through reach our current contract?"];
}
