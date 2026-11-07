// PBM Rule Navigator: the downloadable PDF report, drawn with jsPDF.
// Same content as the emailed report (report.js), laid out as real text so it is sharp,
// searchable and small. Needs window.jspdf (loaded from cdnjs by index.html).

import { compute, describe, fmtLong } from "./logic.js";

const NAVY = [27, 54, 93], TEAL = [45, 139, 154], GOLD = [197, 165, 114], INK = [51, 51, 51], MID = [102, 102, 102], WARN = [180, 84, 26], LIGHT = [245, 245, 245], TEALBG = [238, 246, 247];

async function imgData(url) {
  try {
    const r = await fetch(url); const b = await r.blob();
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
  } catch { return null; }
}

// Strip light markdown from an answer into paragraphs and bullets.
function blocks(text) {
  const out = [];
  for (const raw of String(text || "").split(/\n/)) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (!l) continue;
    const m = l.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    out.push(m ? { bullet: true, t: m[1] } : { t: l });
  }
  return out;
}

export async function buildPDF({ profile, transcript = [], generated = new Date() }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const L = 50, R = W - 50, CW = R - L, BOTTOM = H - 56;
  const r = compute(profile);
  let y = 0;

  const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 56; } };
  const lines = (t, w) => doc.splitTextToSize(String(t), w);
  const para = (t, { size = 10, style = "normal", c = INK, indent = 0, gap = 4, lh = 1.35 } = {}) => {
    font(style, size); color(c);
    for (const ln of lines(t, CW - indent)) { need(size * lh); doc.text(ln, L + indent, y + size); y += size * lh; }
    y += gap;
  };
  const heading = (t) => {
    need(80); y += 10; font("bold", 13); color(NAVY); doc.text(t, L, y + 13); y += 19;
    doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]); doc.setLineWidth(1.5); doc.line(L, y, R, y); y += 10;
  };
  const kv = (k, v, opts = {}) => {
    font("normal", 9.5); const kl = lines(k, 170); const vl = lines(v, CW - 180);
    const h = Math.max(kl.length, vl.length) * 13 + 6; need(h);
    color(MID); kl.forEach((ln, i) => doc.text(ln, L, y + 11 + i * 13));
    font(opts.bold ? "bold" : "normal", 9.5); color(opts.c || INK); vl.forEach((ln, i) => doc.text(ln, L + 180, y + 11 + i * 13));
    y += h; doc.setDrawColor(227, 230, 234); doc.setLineWidth(0.5); doc.line(L, y - 2, R, y - 2);
  };

  // Header band
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 96, "F");
  const logo = await imgData(new URL("assets/nautilus-wordmark-white.png", document.baseURI).href);
  if (logo) doc.addImage(logo, "PNG", L, 20, 110, 28);
  font("bold", 18); doc.setTextColor(255, 255, 255); doc.text("PBM Rule Navigator Report", L, 70);
  font("normal", 9); doc.setTextColor(215, 223, 234);
  doc.text(`The DOL final PBM rule and the Consolidated Appropriations Act (CAA) of 2026  |  Prepared ${fmtLong(new Date(Date.UTC(generated.getFullYear(), generated.getMonth(), generated.getDate())))}`, L, 85);
  y = 116;

  // Headline box
  font("bold", 12); const hl = lines(r.headline, CW - 28);
  font("normal", 10); const nl = r.nextDeadline ? lines("Next: " + r.nextDeadline, CW - 28) : [];
  const bh = hl.length * 16 + nl.length * 14 + 22;
  doc.setFillColor(LIGHT[0], LIGHT[1], LIGHT[2]); doc.rect(L, y, CW, bh, "F");
  doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]); doc.rect(L, y, 4, bh, "F");
  let yy = y + 18; font("bold", 12); color(NAVY); hl.forEach((ln) => { doc.text(ln, L + 16, yy); yy += 16; });
  font("normal", 10); color(INK); nl.forEach((ln) => { doc.text(ln, L + 16, yy); yy += 14; });
  y += bh + 6;

  heading("Your answers");
  for (const [k, v] of describe(profile)) kv(k, v);

  heading("What applies");
  for (const row of r.rows) {
    para(row.label, { style: "bold", c: NAVY, size: 10.5, gap: 2 });
    kv("DOL final rule", row.dol); kv("CAA 2026 pass-through (2028)", row.pass); kv("CAA 2026 PBM reports (2028)", row.rep);
    y += 6;
  }

  if (r.dates.length) {
    heading("Key dates");
    for (const d of r.dates) kv(d.k + (d.note ? ` (${d.note})` : ""), d.v + (d.past ? "  (passed)" : ""), { bold: true, c: d.past ? WARN : NAVY });
    if (r.missing.length) { y += 4; para(`Some dates need the ${r.missing.join(", ")}. These are in the PBM contract or the plan document.`, { size: 9, c: MID }); }
  }

  if (r.flags.length) {
    heading("Watch for");
    for (const f of r.flags) {
      font("normal", 9.5); const fl = lines(`${f.title} ${f.body}`, CW - 20); const h = fl.length * 13 + 12; need(h + 6);
      const bg = f.urgent ? [251, 241, 232] : TEALBG, bar = f.urgent ? WARN : TEAL;
      doc.setFillColor(bg[0], bg[1], bg[2]); doc.rect(L, y, CW, h, "F"); doc.setFillColor(bar[0], bar[1], bar[2]); doc.rect(L, y, 3, h, "F");
      color(INK); fl.forEach((ln, i) => doc.text(ln, L + 12, y + 15 + i * 13)); y += h + 6;
    }
  }

  heading("Your action plan");
  r.actions.forEach((a, i) => {
    font("bold", 8.5); const wl = lines(a.when, CW - 20); font("normal", 10); const tl = lines(`${a.title} ${a.body}`, CW - 20);
    need(wl.length * 11 + tl.length * 13.5 + 10);
    font("bold", 10); color(TEAL); doc.text(`${i + 1}.`, L, y + 10);
    font("bold", 8.5); wl.forEach((ln, j) => doc.text(ln, L + 20, y + 9 + j * 11)); y += wl.length * 11 + 2;
    font("normal", 10); color(INK); tl.forEach((ln) => { doc.text(ln, L + 20, y + 10); y += 13.5; }); y += 8;
  });

  if (transcript.length) {
    heading("Your questions and answers");
    transcript.forEach((t, i) => {
      font("bold", 10); const ql = lines(`Q${i + 1}. ${t.q}`, CW - 20); const qh = ql.length * 13.5 + 12; need(qh + 30);
      doc.setFillColor(TEALBG[0], TEALBG[1], TEALBG[2]); doc.rect(L, y, CW, qh, "F");
      color(NAVY); ql.forEach((ln, j) => doc.text(ln, L + 10, y + 16 + j * 13.5)); y += qh + 6;
      for (const b of blocks(t.a)) {
        const disc = /^General information, not legal advice\.?$/.test(b.t);
        if (b.bullet) {
          font("normal", 9.5); color(INK); const bl = lines(b.t, CW - 34);
          need(13); doc.text("•", L + 14, y + 10);
          bl.forEach((ln) => { need(13); doc.text(ln, L + 26, y + 10); y += 13; }); y += 2;
        } else para(b.t, { size: disc ? 8.5 : 9.5, c: disc ? MID : INK, indent: 10, gap: 5 });
      }
      y += 6;
    });
    para('Answers come only from the Nautilus Fiduciary Action Checklist, the text of the final rule (29 CFR 2550.408b-22) and its preamble. Items marked "pending counsel confirmation" are open questions.', { size: 8.5, c: MID });
  }

  // Next step box
  font("normal", 9.5);
  const ns = lines(`A Contract X-Ray analysis reviews ${r.voice.your} PBM contract against the DOL final rule and CAA 2026 and produces a Negotiation Report: the terms to ask for, model language, and the fiduciary rationale.`, CW - 28);
  const nh = 34 + ns.length * 13 + 20; need(nh + 10); y += 8;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.roundedRect(L, y, CW, nh, 6, 6, "F");
  font("bold", 11.5); doc.setTextColor(255, 255, 255); doc.text(`Next step: see what ${r.voice.your} contract actually says`, L + 14, y + 20);
  font("normal", 9.5); doc.setTextColor(215, 223, 234); ns.forEach((ln, i) => doc.text(ln, L + 14, y + 36 + i * 13));
  font("bold", 9.5); color(GOLD);
  const ly = y + 36 + ns.length * 13 + 6;
  doc.textWithLink("contractxray.com", L + 14, ly, { url: "https://www.contractxray.com/" });
  doc.textWithLink("Full Fiduciary Action Checklist: nautilushealth.org/PBM", L + 130, ly, { url: "https://www.nautilushealth.org/PBM" });
  y += nh + 14;

  para("General information about the DOL final PBM rule (29 CFR 2550.408b-22) and the Consolidated Appropriations Act (CAA) of 2026. Not legal advice, and no attorney-client relationship is created. Confirm plan-specific questions with ERISA counsel.", { size: 8, c: MID, gap: 6 });
  para("Nautilus Health Institute is a 501(c)(3) non-profit organization with a mission to transform health plan market norms in procurement, contracting, and data use by 2030. This report was generated by the PBM Rule Navigator, part of the Nautilus PBM Fiduciary Standards Initiative.", { size: 8, c: MID });

  // Footer on every page
  const n = doc.getNumberOfPages();
  const month = generated.toLocaleString("en-US", { month: "long", year: "numeric" });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); font("normal", 8); color(MID);
    doc.text(`Nautilus Health Institute | ${month} | Page ${i}`, W / 2, H - 28, { align: "center" });
  }
  doc.save("PBM-Rule-Navigator-Report.pdf");
}
