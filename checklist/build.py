"""Build the branded Fiduciary Action Checklist PDF from the Google Doc.

Usage:
  python3 build.py <doc.json> <out.pdf> [--edition 2026.1] [--month "November 2026"]

<doc.json> is the Google Docs API JSON for the checklist (documents.get).
The Google Doc stays the single source of truth; this script only styles it.
"""
import argparse, asyncio, base64, html, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
NAVY, TEAL, GOLD = "#1B365D", "#2D8B9A", "#C5A572"


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def font_face():
    f = lambda n: f"{HERE}/fonts/{n}"
    return f"""
@font-face{{font-family:Fraunces;src:url(data:font/woff2;base64,{b64(f('fraunces-latin-wght-normal.woff2'))}) format('woff2');font-weight:100 900;font-style:normal}}
@font-face{{font-family:Fraunces;src:url(data:font/woff2;base64,{b64(f('fraunces-latin-wght-italic.woff2'))}) format('woff2');font-weight:100 900;font-style:italic}}
@font-face{{font-family:Mono;src:url(data:font/woff2;base64,{b64(f('jetbrains-mono-latin-500-normal.woff2'))}) format('woff2');font-weight:500}}
@font-face{{font-family:InterX;src:url(data:font/otf;base64,{b64(f('Inter-Regular.otf'))}) format('opentype');font-weight:400}}
@font-face{{font-family:InterX;src:url(data:font/otf;base64,{b64(f('Inter-Italic.otf'))}) format('opentype');font-weight:400;font-style:italic}}
@font-face{{font-family:InterX;src:url(data:font/otf;base64,{b64(f('Inter-Medium.otf'))}) format('opentype');font-weight:500}}
@font-face{{font-family:InterX;src:url(data:font/otf;base64,{b64(f('Inter-SemiBold.otf'))}) format('opentype');font-weight:600}}
"""


CSS = """
@page{size:Letter;margin:0.62in 0.72in 0.78in 0.72in}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:InterX,Inter,sans-serif;font-size:9.6pt;line-height:1.52;color:#1f2a37;margin:0}
a{color:#2D8B9A;text-decoration:none}
strong{font-weight:600;color:#1B365D}
em{font-style:italic}
.kicker{font-family:Mono,monospace;font-size:7.4pt;letter-spacing:.32em;color:#C5A572;text-transform:uppercase}
h1{font-family:Fraunces,serif;font-weight:560;font-size:30pt;line-height:1.05;color:#1B365D;margin:10pt 0 4pt;letter-spacing:-.01em}
.dek{font-family:Fraunces,serif;font-style:italic;font-size:13.5pt;color:#2D8B9A;margin:0 0 12pt}
.edition{border-top:1.4pt solid #1B365D;padding-top:7pt;font-family:Mono,monospace;font-size:7pt;letter-spacing:.28em;color:#6b7280;text-transform:uppercase}
table.meta{width:100%;border-collapse:collapse;margin:9pt 0 4pt;font-size:9pt}
table.meta td{border-top:.6pt solid #e5e7eb;padding:6pt 8pt;vertical-align:top}
table.meta tr:last-child td{border-bottom:.6pt solid #e5e7eb}
table.meta td.k{width:1.35in;font-family:Mono,monospace;font-size:6.8pt;letter-spacing:.24em;color:#6b7280;text-transform:uppercase;padding-top:7.5pt}
h2{font-family:Fraunces,serif;font-weight:560;font-size:15.5pt;line-height:1.2;color:#1B365D;margin:20pt 0 0;break-after:avoid;page-break-after:avoid}
h2 + .rule{width:34pt;height:1.6pt;background:#C5A572;margin:6pt 0 9pt}
.sec-kicker{font-family:Mono,monospace;font-size:7pt;letter-spacing:.3em;color:#2D8B9A;text-transform:uppercase;margin:22pt 0 2pt;break-after:avoid}
.sec-kicker + h2{margin-top:0}
h3{font-family:Fraunces,serif;font-weight:600;font-size:11.2pt;color:#1B365D;margin:13pt 0 3pt;break-after:avoid}
p{margin:0 0 7pt;orphans:3;widows:3}
p.lead{font-family:Fraunces,serif;font-size:11pt;line-height:1.45;color:#1B365D}
p.note{font-size:8.6pt;color:#6b7280;font-style:italic}
p.small{font-size:8.4pt;color:#4b5563}
ul.check,ol.steps,ul.plain{list-style:none;margin:2pt 0 10pt;padding:0}
ul.check li{position:relative;padding:3.5pt 0 3.5pt 17pt;border-bottom:.5pt dotted #d1d5db;break-inside:avoid}
ul.check li:last-child{border-bottom:0}
ul.check li:before{content:"";position:absolute;left:0;top:6pt;width:8.5pt;height:8.5pt;border:1.1pt solid #1B365D;border-radius:1.6pt;background:#fff}
ol.steps{counter-reset:s}
ol.steps li{counter-increment:s;position:relative;padding:3pt 0 5pt 22pt;break-inside:avoid}
ol.steps li:before{content:counter(s);position:absolute;left:0;top:3.5pt;width:14pt;height:14pt;border-radius:50%;background:#2D8B9A;color:#fff;font-weight:600;font-size:7.8pt;line-height:14pt;text-align:center}
ul.plain li{padding:1.5pt 0;font-size:8.4pt;break-inside:avoid}
ul.sources{columns:2;column-gap:20pt;list-style:none;padding:0;margin:2pt 0 6pt;font-size:7.7pt;line-height:1.3}
ul.sources li{padding:1pt 0;break-inside:avoid}
table.data{width:100%;border-collapse:collapse;margin:4pt 0 12pt;font-size:8.5pt;line-height:1.4}
table.data th strong,table.data th a{color:#fff;font-weight:500}
table.data th{background:#1B365D;color:#fff;text-align:left;font-family:Mono,monospace;font-weight:500;font-size:6.6pt;letter-spacing:.16em;text-transform:uppercase;padding:6pt 7pt}
table.data td{padding:5.5pt 7pt;border-bottom:.6pt solid #e5e7eb;vertical-align:top}
table.data tr{break-inside:avoid;page-break-inside:avoid}
table.data{break-before:avoid}
table.data tbody tr:nth-child(2),table.data tbody tr:nth-child(3){break-before:avoid}
table.data tbody tr:nth-last-child(-n+2){break-before:avoid}
table.data tbody tr:nth-child(even) td{background:#f7f9fb}
table.data td:first-child{font-weight:500;color:#1B365D}
table.data thead{display:table-header-group}
.callout{border-left:3pt solid #C5A572;background:#faf7f0;padding:9pt 12pt;margin:10pt 0 12pt;break-inside:avoid}
.callout .t{font-family:Fraunces,serif;font-weight:600;font-size:11pt;color:#1B365D;margin-bottom:2pt}
.flow{display:flex;gap:0;margin:8pt 0 10pt;break-inside:avoid}
.flow .st{flex:1;border:1pt solid #d5dde6;border-top:3pt solid #2D8B9A;border-radius:2pt;padding:7pt 8pt;font-size:8.3pt;line-height:1.38;background:#fff}
.flow .st .n{font-family:Mono,monospace;font-size:6.6pt;letter-spacing:.2em;color:#2D8B9A;margin-bottom:3pt}
.flow .ar{width:12pt;display:flex;align-items:center;justify-content:center;color:#C5A572;font-size:11pt}
.ladder{display:flex;gap:8pt;margin:8pt 0 4pt;break-inside:avoid}
.ladder div{flex:1;border:1pt solid #d5dde6;border-radius:2pt;padding:6pt 8pt;font-size:8pt;line-height:1.32}
.ladder .n{font-family:Mono,monospace;font-size:6.6pt;letter-spacing:.2em;color:#C5A572;text-transform:uppercase}
.ladder b{display:block;font-family:Fraunces,serif;font-weight:600;font-size:10.5pt;color:#1B365D;margin:2pt 0 2pt}
.ladder .here{background:#1B365D;color:#e5ecf3;border-color:#1B365D}.ladder .here b{color:#fff}
.disclaimer{margin-top:6pt;border-top:.6pt solid #d1d5db;padding-top:5pt;font-size:7.4pt;color:#6b7280}
.keep{break-inside:avoid}
"""


def esc(t):
    return html.escape(t, quote=False)


def runs_html(elements):
    out = []
    for e in elements:
        tr = e.get("textRun")
        if not tr:
            continue
        t = tr["content"].replace("\u000b", " ").replace("\n", "").replace("™", "")
        if not t:
            continue
        t = re.sub(r'(^|[\s(\[])"', "\\1\u201c", t).replace('"', "\u201d")
        t = re.sub(r"(^|[\s(\[])'", "\\1\u2018", t).replace("'", "\u2019")
        st = tr.get("textStyle", {})
        h = esc(t)
        link = st.get("link", {}).get("url")
        if st.get("italic"):
            h = f"<em>{h}</em>"
        if st.get("bold") and t.strip():
            h = f"<strong>{h}</strong>"
        if link:
            h = f'<a href="{html.escape(link)}">{h}</a>'
        out.append(h)
    s = "".join(out)
    s = re.sub(r"</strong><strong>", "", s)
    s = re.sub(r"</em><em>", "", s)
    return s.strip()


def plain(elements):
    return "".join(e.get("textRun", {}).get("content", "") for e in elements).replace("\u000b", " ").strip()


def cell_html(cell):
    parts = [runs_html(c["paragraph"]["elements"]) for c in cell["content"] if "paragraph" in c]
    return "<br>".join(p for p in parts if p)


def section_heading(text):
    m = re.match(r"^(Step \d+|Now Through Mid-2027|Before Your Next Renewal|When Disclosures Arrive|August 2028|Watch List):\s*(.+)$", text)
    if m:
        brk = ""
        return f'<div class="sec-kicker"{brk}>{esc(m.group(1))}</div><h2>{esc(m.group(2))}</h2><div class="rule"></div>'
    return f'<h2>{esc(text)}</h2><div class="rule"></div>'


def build_body(doc):
    dt = doc["tabs"][0]["documentTab"]
    body = dt["body"]["content"]
    out, i = [], 0
    started = False
    items = []  # pending list items: (listId, html, plain)

    def flush():
        nonlocal items
        if not items:
            return
        first = items[0][2]
        if first.startswith("Send the PBM a written request"):
            labels = ["Request", "Cure window", "Notify DOL", "Decide"]
            cells = []
            for k, (_, h, _) in enumerate(items):
                cells.append(f'<div class="st"><div class="n">{k+1} · {labels[k].upper() if k < len(labels) else ""}</div>{h}</div>')
            out.append('<div class="flow">' + '<div class="ar">&#9656;</div>'.join(cells) + "</div>")
        elif first.startswith("Pull the complete contract"):
            out.append('<ol class="steps">' + "".join(f"<li>{h}</li>" for _, h, _ in items) + "</ol>")
        elif sources_mode:
            out.append('<ul class="sources">' + "".join(f"<li>{h}</li>" for _, h, _ in items) + "</ul>")
        else:
            out.append('<ul class="check">' + "".join(f"<li>{h}</li>" for _, h, _ in items) + "</ul>")
        items = []

    sources_mode = False
    for el in body:
        if "paragraph" in el:
            p = el["paragraph"]
            if any("inlineObjectElement" in e for e in p["elements"]):
                continue  # relief protocol image: replaced by the drawn flow
            txt = plain(p["elements"])
            style = p["paragraphStyle"].get("namedStyleType", "")
            if not started:
                if style == "HEADING_3":
                    started = True
                else:
                    continue  # title and subtitle come from the cover block
            if not txt:
                flush()
                continue
            if p.get("bullet"):
                if items and items[-1][0] != p["bullet"]["listId"]:
                    flush()
                items.append((p["bullet"]["listId"], runs_html(p["elements"]), txt))
                continue
            flush()
            if style.startswith("HEADING"):
                if txt == "Sources":
                    sources_mode = True
                    out.append(LADDER)
                out.append(section_heading(txt))
                continue
            h = runs_html(p["elements"])
            if txt.startswith("This checklist explains regulatory requirements"):
                out.append(f'<div class="disclaimer">{h}</div>')
                continue
            if txt.startswith("Items marked") or txt.startswith("The 2028 items rest on"):
                out.append(f'<p class="note">{h}</p>')
                continue
            mt = re.match(r"^(Terms to elect|Terms to strike|Terms prudence calls for)\.\s*(.*)$", txt)
            if mt:
                rest = re.sub(r"^(<strong>)?(Terms to elect|Terms to strike|Terms prudence calls for)\.?(</strong>)?\.?\s*", "", h)
                out.append(f"<h3>{mt.group(1)}</h3>")
                out.append(f"<p>{rest}</p>")
                continue
            # bold lead on a short paragraph becomes a subhead
            m = re.match(r"^<strong>([^<]{3,60}?)\.?\s*</strong>\.?\s*(.*)$", h)
            if m and len(txt) < 140 and not txt.startswith("Who owes"):
                out.append(f"<h3>{m.group(1).rstrip('.')}.</h3>")
                if m.group(2):
                    out.append(f"<p>{m.group(2)}</p>")
                continue
            if txt.startswith("On October 29, 2026"):
                out.append(f'<p class="lead">{h}</p>')
                continue
            out.append(f"<p>{h}</p>")
        elif "table" in el:
            flush()
            rows = el["table"]["tableRows"]
            hdr = "".join(f"<th>{cell_html(c)}</th>" for c in rows[0]["tableCells"])
            trs = "".join("<tr>" + "".join(f"<td>{cell_html(c)}</td>" for c in r["tableCells"]) + "</tr>" for r in rows[1:])
            out.append(f'<table class="data"><thead><tr>{hdr}</tr></thead><tbody>{trs}</tbody></table>')
    flush()
    return "\n".join(keep_together(out))


def keep_together(blocks):
    """Stop orphans: headings stay with what follows, the first two checklist
    items stay with the text before them, and short tables stay with their intro."""
    is_head = lambda b: b.startswith('<div class="sec-kicker"') or b.startswith("<h2>") or b.startswith("<h3>")
    out, i = [], 0
    while i < len(blocks):
        b = blocks[i]
        if b.startswith('<ul class="check">'):
            items = re.findall(r"<li>.*?</li>", b, re.S)
            if len(items) > 2:
                head = '<ul class="check" style="margin-bottom:0">' + "".join(items[:2]) + "</ul>"
                rest = items[2:]
                if len(rest) > 2:
                    tail = ('<ul class="check" style="margin:0">' + "".join(rest[:-2]) + "</ul>"
                            '<div class="keep"><ul class="check" style="margin-top:0">' + "".join(rest[-2:]) + "</ul></div>")
                else:
                    tail = '<div class="keep"><ul class="check" style="margin-top:0">' + "".join(rest) + "</ul></div>"
            else:
                head, tail = b, None
            if out and (out[-1].startswith("<p") or out[-1].startswith('<div class="keep">')):
                out[-1] = f'<div class="keep">{out[-1]}{head}</div>'
            else:
                out.append(f'<div class="keep">{head}</div>')
            if tail:
                out.append(tail)
            i += 1
            continue
        if b.startswith('<table class="data">') and b.count("<tr>") <= 5 and out and (
                out[-1].startswith("<p") or out[-1].startswith('<div class="keep">')):
            out[-1] = f'<div class="keep">{out[-1]}{b}</div>'
            i += 1
            continue
        if b.startswith('<div class="flow"') and out and out[-1].startswith("<p"):
            out[-1] = f'<div class="keep">{out[-1]}{b}</div>'
            i += 1
            continue
        if is_head(b):
            group = [b]
            i += 1
            while i < len(blocks) and (is_head(blocks[i]) or blocks[i] == ""):
                group.append(blocks[i]); i += 1
            if i < len(blocks) and (blocks[i].startswith("<p") or blocks[i].startswith('<div class="flow"')):
                group.append(blocks[i]); i += 1
            out.append('<div class="keep">' + "".join(group) + "</div>")
            continue
        out.append(b)
        i += 1
    return out


LADDER = """
<div class="keep"><h2>Put the Checklist to Work</h2><div class="rule"></div>
<div class="ladder">
  <div class="here"><div class="n">Step 1 · You are here</div><b>Fiduciary Action Checklist</b>Every deadline, contract term, and decision the rule puts on your desk.</div>
  <div><div class="n">Step 2 · Free</div><b>PBM Rule Navigator</b>Your plan's deadlines and action plan in two minutes. Ask anything; every answer cites the rule. <a href="https://www.nautilushealth.org/PBM">nautilushealth.org/PBM</a></div>
  <div><div class="n">Step 3 · Free</div><b>Contract X-Ray Quick Look</b>Test your actual PBM contract against fiduciary-aligned standards. <a href="https://www.contractxray.com/">contractxray.com</a></div>
  <div><div class="n">Step 4</div><b>Full Assessment</b>A Negotiation Report with the terms to request and the model language to propose.</div>
</div></div>
"""


def cover(edition, month):
    return f"""
<div class="kicker">Nautilus Health Institute · PBM Project Resource</div>
<h1>Fiduciary Action Checklist</h1>
<div class="dek">Every deadline, contract term, and decision the new PBM rule puts on your desk</div>
<div class="edition">Edition {edition} · {month} · DOL Final Rule 29 CFR 2550.408b-22 and CAA 2026</div>
<table class="meta">
<tr><td class="k">Audience</td><td>Plan sponsors, plan fiduciaries, and the brokers, consultants, and attorneys who advise them</td></tr>
<tr><td class="k">Purpose</td><td>What to do, by when, under the DOL final PBM rule and CAA 2026: who owes you disclosures, which contract terms to elect and strike, and how to act when disclosures arrive</td></tr>
<tr><td class="k">Companion</td><td>The free PBM Rule Navigator applies this checklist to your plan in two minutes. Contract X-Ray tests your actual contract</td></tr>
<tr><td class="k">Online</td><td><a href="https://www.nautilushealth.org/PBM">nautilushealth.org/PBM</a> · <a href="https://www.contractxray.com/">contractxray.com</a></td></tr>
</table>
"""


def footer_template(month):
    logo = b64(os.path.join(HERE, "..", "assets", "nautilus-wordmark-navy.png"))
    return f"""<div style="width:100%;margin:0 0.72in;border-top:0.6pt solid #1B365D;padding-top:6px;display:flex;justify-content:space-between;align-items:center;font-family:Inter,sans-serif;font-size:6.6px;letter-spacing:0.16em;color:#6b7280;-webkit-print-color-adjust:exact">
<img src="data:image/png;base64,{logo}" style="height:11px">
<span>EMPLOYER-FIRST. INDEPENDENT EXPERTISE. NO VENDOR CONFLICTS.</span>
<span>{month.upper()} · PAGE <span class="pageNumber"></span> OF <span class="totalPages"></span></span></div>"""


async def render(html_doc, out, month):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.set_content(html_doc, wait_until="networkidle")
        await pg.evaluate("document.fonts.ready")
        await pg.pdf(path=out, format="Letter", print_background=True, prefer_css_page_size=True,
                     display_header_footer=True, header_template="<div></div>", footer_template=footer_template(month))
        await b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("doc")
    ap.add_argument("out")
    ap.add_argument("--edition", default="2026.1")
    ap.add_argument("--month", default="November 2026")
    a = ap.parse_args()
    d = json.load(open(a.doc))
    d = d.get("content", d)
    body = build_body(d)
    html_doc = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Fiduciary Action Checklist | Nautilus Health Institute</title>
<style>{font_face()}{CSS}</style></head><body>{cover(a.edition, a.month)}{body}</body></html>"""
    with open(a.out.replace(".pdf", ".html"), "w") as f:
        f.write(html_doc)
    asyncio.run(render(html_doc, a.out, a.month))
    print("wrote", a.out)


if __name__ == "__main__":
    main()
