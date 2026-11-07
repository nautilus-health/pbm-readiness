"""Build the branded PDF of Nautilus's April 14, 2026 DOL comment letter, text as filed.

Usage: python3 build_letter.py <doc.json> <out.pdf>
"""
import asyncio, html, json, re, sys
from build import font_face, CSS, runs_html, plain, footer_template, render

EXTRA = """
.addr{font-size:9.4pt;line-height:1.45;margin:14pt 0 8pt;color:#374151}
.re{font-weight:600;color:#1B365D;margin:0 0 2pt}
.re2{font-family:Mono,monospace;font-size:7.4pt;letter-spacing:.16em;color:#6b7280;margin-bottom:6pt}
h4{font-family:Fraunces,serif;font-weight:600;font-size:10.8pt;color:#2D8B9A;margin:12pt 0 3pt;break-after:avoid}
ul.dots{margin:2pt 0 9pt 0;padding-left:15pt}
ul.dots li{margin:2.5pt 0;break-inside:avoid}
blockquote.reg{margin:8pt 0 11pt;padding:10pt 14pt;border-left:3pt solid #1B365D;background:#f4f7fa;font-family:Fraunces,serif;font-style:italic;font-size:10pt;line-height:1.5;color:#1B365D;break-inside:avoid}
.sig{break-inside:avoid}.sig > p:first-child{margin-bottom:14pt}
.sig .who{font-weight:600;color:#1B365D;margin-top:18pt}
"""


def cover():
    return """
<div class="kicker">Nautilus Health Institute · Public Comment</div>
<h1 style="font-size:26pt">Comments on the Proposed PBM Fee Disclosure Rule</h1>
<div class="dek">Submitted to the U.S. Department of Labor, Employee Benefits Security Administration</div>
<div class="edition">RIN 1210-AB37 · 91 Fed. Reg. 4348 (Jan. 30, 2026) · Submitted April 14, 2026</div>
<table class="meta">
<tr><td class="k">Submitted by</td><td>Sean Schantzen, Executive Director, Nautilus Health Institute</td></tr>
<tr><td class="k">Recommends</td><td>(1) A safe harbor for fiduciaries who proactively select PBMs with fiduciary-aligned contract terms; (2) coverage harmonized with CAA 2026; (3) transaction-level data in machine-readable formats; (4) no contractual limits on PBM accountability for disclosures</td></tr>
<tr><td class="k">Status</td><td>Reproduced as filed, on the proposed rule. DOL issued the final rule on October 29, 2026 (29 CFR 2550.408b-22). For what the final rule requires, see the Fiduciary Action Checklist</td></tr>
<tr><td class="k">Online</td><td><a href="https://www.nautilushealth.org/PBM">nautilushealth.org/PBM</a> · <a href="https://www.contractxray.com/">contractxray.com</a></td></tr>
</table>
"""


def build(doc):
    dt = doc["tabs"][0]["documentTab"] if "tabs" in doc else doc
    body = dt["body"]["content"]
    out, bullets, addr = [], [], []

    def flush():
        nonlocal bullets
        if bullets:
            out.append('<ul class="dots">' + "".join(f"<li>{b}</li>" for b in bullets) + "</ul>")
            bullets = []

    for el in body:
        if "table" in el:
            flush()
            cells = el["table"]["tableRows"][0]["tableCells"]
            txt = " ".join(plain(c["paragraph"]["elements"]) for c in cells[0]["content"] if "paragraph" in c)
            txt = txt.strip().strip("*").strip()
            txt = txt.replace('"', "").strip()
            out.append(f'<blockquote class="reg">“{html.escape(txt)}”</blockquote>')
            continue
        if "paragraph" not in el:
            continue
        p = el["paragraph"]
        t = plain(p["elements"])
        if not t:
            continue
        st = p["paragraphStyle"].get("namedStyleType", "")
        h = runs_html(p["elements"])
        if el["startIndex"] < 172:
            addr.append(html.escape(t))
            continue
        if t.startswith("Re: Improving"):
            out.append('<div class="addr">' + "<br>".join(addr) + "</div>")
            out.append(f'<div class="re">{html.escape(t)}</div>')
            continue
        if t.startswith("RIN 1210-AB37"):
            out.append(f'<div class="re2">{html.escape(t)}</div>')
            continue
        if p.get("bullet"):
            bullets.append(h)
            continue
        flush()
        if st.startswith("HEADING"):
            out.append(f'<h2>{html.escape(t)}</h2><div class="rule"></div>')
            continue
        if re.match(r"^[A-G]\. ", t) and len(t) < 80:
            out.append(f"<h4>{html.escape(t)}</h4>")
            continue
        if t == "Respectfully submitted,":
            prev = out.pop() if out and out[-1].startswith("<p>") else ""
            out.append(f'<div class="sig">{prev}<p>{h}</p>')
            continue
        if t.startswith("Sean Schantzen"):
            out.append(f'<div class="who">{html.escape(t)}</div>')
            continue
        if t in ("Nautilus Health Institute",):
            out.append(f"<div>{html.escape(t)}</div>")
            continue
        if t == "April 14, 2026":
            out.append(f"<div>{html.escape(t)}</div></div>")
            continue
        out.append(f"<p>{h}</p>")
    flush()
    # keep each heading with the block after it
    merged, i = [], 0
    while i < len(out):
        b = out[i]
        if (b.startswith("<h2>") or b.startswith("<h4>")) and i + 1 < len(out):
            nxt = out[i + 1]
            if nxt.startswith("<h4>") and i + 2 < len(out):
                merged.append(f'<div class="keep">{b}{nxt}{out[i+2]}</div>'); i += 3; continue
            merged.append(f'<div class="keep">{b}{nxt}</div>'); i += 2; continue
        merged.append(b); i += 1
    return "\n".join(merged)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    d = json.load(open(src))
    d = d.get("content", d)
    doc = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Nautilus Comments on the Proposed PBM Fee Disclosure Rule</title>
<style>{font_face()}{CSS}{EXTRA}</style></head><body>{cover()}{build(d)}</body></html>"""
    open(dst.replace(".pdf", ".html"), "w").write(doc)
    asyncio.run(render(doc, dst, "Submitted April 14, 2026"))
    print("wrote", dst)


if __name__ == "__main__":
    main()
