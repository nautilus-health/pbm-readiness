"""Derive the public 2026.2 checklist source from the 2027 review-draft Doc JSON.

The public edition keeps the November 2026 (2026.1) regulatory content and adds
only the Navigator references and current links. Content that is new in the
2027 review draft (still out with reviewers) is removed here.

Usage: python3 derive.py review_draft_doc.json public_2026_2_doc.json
"""
import json, sys

REPLACE = [
    (" The Navigator gives you each deadline from your plan year and renewal date.", ""),
    (" If you're unsure whether a term in your own contract survives the rule, ask the Navigator.", ""),
    (" It shows your deadlines and an action plan. Then ask it anything about the DOL rule or CAA 2026 in plain English. It answers from the rule text and cites the paragraph and page.", " It shows your deadlines and answers your questions, citing the rule."),
    (" The PBM Rule Navigator at nautilushealth.org/pbm works out the answer for your plan in about two minutes and answers your follow-up questions, citing the rule.", ""),
    ("issued its PBM Fee Disclosure Rule (the DOL rule).", "released its final PBM fee disclosure rule."),
    ("Start Here: Know Which Rules Reach Your Plan", "Step 0: Know Which Rules Reach Your Plan"),
    ("(see Start Here)", "(see Step 0)"),
    (" Also ask your PBM, TPA, and carriers in writing to disclose anything they pay your broker, consultant, or coalition, including payments for leads, meetings, finalist slots, or sharing your claims data, whether or not a sale follows", ""),
    ("It scores the contract against ten fiduciary-aligned provisions in three domains, from rebate pass-through and audit rights to data ownership and clean exit, and rates it Gold, Silver, or Bronze. A PBM whose standard contract has earned Gold already meets them. The analysis produces a Negotiation Report:",
     "It evaluates the contract against Fiduciary-Aligned PBM Contract Standards organized into 10 categories, from rebate pass-through and audit rights to data ownership and clean exit, and produces a Negotiation Report:"),
    (" If your current contract runs past the date the rule applies, don't wait for renewal. The Nautilus PBM Contract Compliance RFI asks your current PBM to adopt these terms in writing, effective no later than the first plan year the rule applies to.", ""),
    ("direct compensation by service, with a good-faith allocation for bundled services;", "direct compensation by service;"),
    ("Amounts stated in dollars for each six-month period, or each quarter if you elected quarterly reports, with drug-level items in files that identify each drug by name and NDC.", "Amounts stated in dollars."),
    ("alternative funding programs, 340B-related income, float", "alternative funding programs, float"),
    (". The Nautilus PBM Market Test RFI and Request for Proposals include the disclosure table and certification", ""),
    ("The 2028 requirements are enacted law under CAA 2026 Sections 6701 and 6702. Only the interpretive questions listed at the end of this checklist await counsel confirmation.",
     "The 2028 items rest on the enacted text of CAA 2026 Sections 6701 and 6702 and await counsel confirmation."),
    ("Items pending counsel confirmation (the CAA 2026 requirements and dates themselves are enacted law):", "Items pending counsel confirmation in this checklist:"),
    ("Which contract events trigger CAA 2026, and what \"bona fide service fee\" means", "All 2028 statutory items"),
    ("DOL rule becomes effective", "Final rule becomes effective"),
]
CELL_EXACT = [("DOL rule", "DOL final rule")]  # table header cell
DROP_PREFIX = [
    "Three disclosures beyond the rule's minimum",
    "An officer of the PBM certifies",
    "A contract definition of 340B claims",
    "The PBM exchanges the data the plan's other vendors need",
    "Objective definitions of generic, brand, and specialty drugs",
    "The three disclosures you asked for beyond the rule",
]

def ptext(p): return "".join(e.get("textRun", {}).get("content", "") for e in p["elements"])

def main(src, dst):
    d = json.load(open(src))
    d = d.get("content", d)
    body = d["tabs"][0]["documentTab"]["body"]["content"]
    hits = {o: 0 for o, _ in REPLACE}
    def fix_par(p):
        for e in p["elements"]:
            tr = e.get("textRun")
            if not tr: continue
            for o, n in REPLACE:
                if o in tr["content"]:
                    tr["content"] = tr["content"].replace(o, n); hits[o] += 1
        if ptext(p).strip() in [c for c, _ in CELL_EXACT]:
            for e in p["elements"]:
                if "textRun" in e:
                    for o, n in CELL_EXACT:
                        if e["textRun"]["content"].strip() == o:
                            e["textRun"]["content"] = e["textRun"]["content"].replace(o, n)
    def walk(o):
        if isinstance(o, dict):
            if "paragraph" in o: fix_par(o["paragraph"])
            for k, v in o.items():
                if k != "paragraph": walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(body)
    keep, dropped = [], []
    for el in body:
        if "paragraph" in el and any(ptext(el["paragraph"]).startswith(x) for x in DROP_PREFIX):
            dropped.append(ptext(el["paragraph"])[:60]); continue
        keep.append(el)
    d["tabs"][0]["documentTab"]["body"]["content"] = keep
    miss = [o for o, c in hits.items() if c == 0]
    print("dropped:", len(dropped)); [print("  -", x) for x in dropped]
    print("replacements missing:", miss)
    json.dump(d, open(dst, "w"))
    return 1 if miss or len(dropped) != len(DROP_PREFIX) else 0

if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
