// PBM Rule Readiness Check: the full report as one HTML document.
// Used for the emailed report (Worker) and the PDF download (page). Inline styles
// and tables only, so it renders the same in Gmail, Outlook and a PDF.

import { compute, describe, fmtLong } from "./logic.js";

const NAVY = "#1B365D", TEAL = "#2D8B9A", GOLD = "#C5A572", LIGHT = "#F5F5F5", INK = "#333333", MID = "#666666", WARN = "#B4541A";
const SITE = "https://nautilus-health.github.io/pbm-readiness/";

export function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Light markdown for answers: paragraphs, bullet lists, **bold**.
export function md(t) {
  const out = []; let list = false;
  for (let l of esc(t).split(/\n/)) {
    l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) { if (!list) { out.push(`<ul style="margin:4px 0 10px;padding-left:20px">`); list = true; } out.push(`<li style="margin:0 0 4px">${m[1]}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    if (!l.trim()) continue;
    if (/^General information, not legal advice\.?$/.test(l.trim())) out.push(`<p style="margin:0;color:${MID};font-size:12px">${l}</p>`);
    else out.push(`<p style="margin:0 0 10px">${l}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

const h2 = (t) => `<h2 style="font-size:17px;color:${NAVY};margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid ${TEAL}">${t}</h2>`;

export function renderReport({ profile, transcript = [], generated = new Date(), forEmail = false }) {
  const r = compute(profile);
  const Y = r.voice;
  const B = [];
  B.push(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PBM Rule Readiness Report</title></head>`);
  B.push(`<body style="margin:0;padding:0;background:#ffffff;font-family:Roboto,Arial,Helvetica,sans-serif;color:${INK};font-size:14px;line-height:1.5">`);
  B.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td align="center" style="padding:0">`);
  B.push(`<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:680px;width:100%">`);

  // Header
  B.push(`<tr><td style="background:${NAVY};padding:20px 28px">
    <img src="${SITE}assets/nautilus-wordmark-white.png" alt="Nautilus" width="150" style="display:block;height:auto;border:0;margin-bottom:12px">
    <div style="color:#ffffff;font-size:22px;font-weight:bold">PBM Rule Readiness Report</div>
    <div style="color:#D7DFEA;font-size:13px;margin-top:4px">The DOL final PBM rule and the Consolidated Appropriations Act (CAA) of 2026 | Prepared ${esc(fmtLong(new Date(Date.UTC(generated.getUTCFullYear(), generated.getUTCMonth(), generated.getUTCDate()))))}</div>
  </td></tr>`);
  B.push(`<tr><td style="padding:6px 28px 28px">`);

  // Headline
  B.push(`<div style="background:${LIGHT};border-left:5px solid ${TEAL};padding:14px 16px;margin:20px 0 4px">
    <div style="font-size:16px;font-weight:bold;color:${NAVY}">${esc(r.headline)}</div>
    ${r.nextDeadline ? `<div style="margin-top:6px"><b>Next:</b> ${esc(r.nextDeadline)}</div>` : ""}
  </div>`);

  // Profile
  B.push(h2("Your answers"));
  B.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">`);
  for (const [k, v] of describe(profile)) B.push(`<tr><td style="padding:5px 8px;border-bottom:1px solid #E3E6EA;color:${MID};width:40%">${esc(k)}</td><td style="padding:5px 8px;border-bottom:1px solid #E3E6EA">${esc(v)}</td></tr>`);
  B.push(`</table>`);

  // What applies
  B.push(h2("What applies"));
  for (const row of r.rows) {
    B.push(`<div style="border:1px solid #E3E6EA;border-radius:6px;padding:10px 14px;margin:0 0 10px">
      <div style="font-weight:bold;color:${NAVY};margin-bottom:6px">${esc(row.label)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
      <tr><td style="padding:3px 0;color:${MID};width:40%;vertical-align:top">DOL final rule</td><td style="padding:3px 0">${esc(row.dol)}</td></tr>
      <tr><td style="padding:3px 0;color:${MID};vertical-align:top">CAA 2026 pass-through (2028)</td><td style="padding:3px 0">${esc(row.pass)}</td></tr>
      <tr><td style="padding:3px 0;color:${MID};vertical-align:top">CAA 2026 PBM reports (2028)</td><td style="padding:3px 0">${esc(row.rep)}</td></tr>
      </table></div>`);
  }

  // Dates
  if (r.dates.length) {
    B.push(h2("Key dates"));
    B.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">`);
    for (const x of r.dates) B.push(`<tr><td style="padding:6px 8px;border-bottom:1px solid #E3E6EA">${esc(x.k)}${x.note ? `<div style="color:${MID};font-size:12px">${esc(x.note)}</div>` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #E3E6EA;font-weight:bold;color:${x.past ? WARN : NAVY};white-space:nowrap;text-align:right">${esc(x.v)}${x.past ? `<div style="font-weight:normal;font-size:12px">Passed</div>` : ""}</td></tr>`);
    B.push(`</table>`);
  }
  if (r.missing.length) B.push(`<p style="color:${MID};font-size:12px">Some dates need the ${esc(r.missing.join(", "))}. These are in the PBM contract or the plan document.</p>`);

  // Flags
  if (r.flags.length) {
    B.push(h2("Watch for"));
    for (const f of r.flags) B.push(`<div style="border-left:4px solid ${f.urgent ? WARN : TEAL};background:${f.urgent ? "#FBF1E8" : "#EEF6F7"};padding:9px 12px;margin:0 0 8px;font-size:13px"><b style="color:${f.urgent ? WARN : NAVY}">${esc(f.title)}</b> ${esc(f.body)}</div>`);
  }

  // Actions
  B.push(h2("Your action plan"));
  B.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">`);
  r.actions.forEach((a, i) => B.push(`<tr><td style="padding:7px 10px 7px 0;vertical-align:top;width:24px;font-weight:bold;color:${TEAL}">${i + 1}.</td><td style="padding:7px 0;border-bottom:1px solid #E3E6EA"><div style="color:${TEAL};font-size:12px;font-weight:bold">${esc(a.when)}</div><b>${esc(a.title)}</b> ${esc(a.body)}</td></tr>`));
  B.push(`</table>`);

  // Q&A
  if (transcript.length) {
    B.push(h2("Your questions and answers"));
    transcript.forEach((t, i) => {
      B.push(`<div style="margin:0 0 16px"><div style="background:#EEF6F7;border-radius:6px;padding:8px 12px;font-weight:bold;color:${NAVY}">Q${i + 1}. ${esc(t.q)}</div><div style="padding:10px 12px 0">${md(t.a)}</div></div>`);
    });
    B.push(`<p style="color:${MID};font-size:12px">Answers come only from the Nautilus Fiduciary Action Checklist, the text of the final rule (29 CFR 2550.408b-22) and its preamble. Items marked "pending counsel confirmation" are open questions.</p>`);
  }

  // Next step
  B.push(`<div style="background:${NAVY};color:#ffffff;border-radius:8px;padding:16px 18px;margin:26px 0 8px">
    <div style="font-weight:bold;font-size:15px;margin-bottom:6px">Next step: see what ${esc(Y.your)} contract actually says</div>
    <div style="font-size:13px;color:#D7DFEA">A Contract X-Ray analysis reviews ${esc(Y.your)} PBM contract against the DOL final rule and CAA 2026 and produces a Negotiation Guide: the terms to ask for, model language, and the fiduciary rationale.</div>
    <div style="margin-top:10px"><a href="https://www.contractxray.com/" style="color:${GOLD};font-weight:bold">contractxray.com</a> &nbsp;|&nbsp; <a href="https://www.nautilushealth.org/PBM" style="color:${GOLD};font-weight:bold">Full Fiduciary Action Checklist</a></div>
  </div>`);

  // Footer
  B.push(`<p style="color:${MID};font-size:11px;margin-top:22px;border-top:1px solid #E3E6EA;padding-top:12px">
    General information about the DOL final PBM rule (29 CFR 2550.408b-22) and the Consolidated Appropriations Act (CAA) of 2026. Not legal advice, and no attorney-client relationship is created. Confirm plan-specific questions with ERISA counsel.<br><br>
    Nautilus Health Institute is a 501(c)(3) non-profit organization with a mission to transform health plan market norms in procurement, contracting, and data use by 2030. This report was generated by the PBM Rule Readiness Check, part of the Nautilus PBM Fiduciary Standards Initiative. ${forEmail ? `You received it because this address was entered at ${SITE}.` : ""}<br>
    Copyright &copy; ${generated.getUTCFullYear()} Nautilus Health Institute
  </p>`);

  B.push(`</td></tr></table></td></tr></table></body></html>`);
  return B.join("\n");
}
