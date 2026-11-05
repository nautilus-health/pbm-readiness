# Deploying the question feature

The page on GitHub Pages works without the Worker: results show, and the question panel says "coming next". The question feature turns on when `WORKER_URL` in `index.html` points at a deployed Worker.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html` | The tool. `WORKER_URL` near the Q&A section switches questions on. Testers can also add `?api=https://<worker-url>` to the page address. |
| `knowledge/pack-v1.2.md` | The only material Claude answers from: the Nautilus checklist, the regulation text with page numbers, selected preamble passages, and the open-items list. |
| `logic.js`, `report.js`, `pdf.js` | Results logic (shared by page and Worker), the emailed HTML report, and the PDF download. |
| `worker/` | Cloudflare Worker: `POST /start` (anonymous session), `POST /ask` (one answer; 5 free, 10 after email), `POST /report` (emails the report through the Sheet script and records the lead), `GET /health`. |
| `worker/schema.sql` | D1 tables: `sessions`, `asks`, and `failed_leads` (only used if the Sheet can't be reached). No emails are stored in D1. |
| `apps-script/Code.gs` | The script attached to the "PBM Readiness Check: Leads" Google Sheet. It receives each sign-up from the Worker and adds a row. |
| `eval/questions.json`, `eval/run.mjs` | 47 test questions with automatic checks, and the runner that writes a review report for counsel. |

## Automatic deploys (GitHub Actions)

`.github/workflows/worker.yml` deploys the Worker whenever a push to `main` changes `worker/`, `knowledge/`, `logic.js` or `report.js`. It uses one repository secret, `CLOUDFLARE_API_TOKEN` (Workers Scripts Write, D1 Write, Account Settings Read on Steve's Cloudflare account; expires November 3, 2027). The account ID is in `worker/wrangler.toml`.

To check the token without deploying: Actions > Worker > Run workflow > check. To redeploy by hand: same, with deploy.

To renew the token: in Cloudflare, Roll or recreate it, copy the **API Token** value (not the R2 access keys), and update the GitHub secret.

## One-time setup (Cloudflare)

You need Node.js installed. From the repo folder:

```bash
cd worker
npx wrangler login
npx wrangler d1 create pbm-readiness          # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute pbm-readiness --remote --file schema.sql   # new database
# existing database from v0.2: npx wrangler d1 execute pbm-readiness --remote --file migrations/0002_report.sql
npx wrangler secret put ANTHROPIC_API_KEY      # paste the Claude API key
npx wrangler secret put IP_SALT                # any long random string
npx wrangler secret put EVAL_TOKEN             # any long random string; lets the eval skip rate limits
npx wrangler secret put SHEET_WEBHOOK_URL      # the Apps Script web app URL (ends in /exec)
npx wrangler secret put SHEET_SECRET           # same value as LEADS_SECRET in the Apps Script
npx wrangler deploy
```

`deploy` prints the Worker address, for example `https://pbm-readiness.<account>.workers.dev`. Check it with `<address>/health`.

## Test before switching on

1. Open `https://nautilus-health.github.io/pbm-readiness/?review&api=<worker address>` and ask a few questions. `review` shows the test-profile picker.
2. Run the eval and send the report to counsel:

```bash
node eval/run.mjs --url <worker address> --token <EVAL_TOKEN>
```

The report lands in `eval/results/` (not committed). Launch bar from the spec: at least 95% pass, and zero answers that state an open item as settled.

## Switch on

Set `var WORKER_URL = "<worker address>";` in `index.html`, commit and push. GitHub Pages updates in a minute or two.

## Settings (worker/wrangler.toml)

| Setting | Default | Notes |
|---|---|---|
| `MODEL` | `claude-sonnet-5-5` | Change here when a model is retired; redeploy. |
| `PACK_VERSION` | `1.2` | Bump with every knowledge-pack change. Each answer is logged with the version used. |
| `ALLOWED_ORIGINS` | GitHub Pages, nautilushealth.org, contractxray.com | Pages that may call the Worker. |
| `FREE_QUESTIONS` | `5` | Questions before an email is given. |
| `MAX_QUESTIONS` | `10` | Total questions per session after the email. |
| `EFFORT` | `medium` | How much the model thinks before answering. |
| `IP_HOURLY_LIMIT` | `30` | Questions per network per hour. |
| `LOG_QUESTIONS` | `true` | Stores question text for the eval period. Set to `false` at launch, per the privacy section of the spec. |

## Leads (Google Sheet)

Every report request becomes a row in the **PBM Readiness Check: Leads** Google Sheet owned by steve.ditto@nautilushealth.org (the copy made under the Nautilus account; its script sends the report email from that address): time received, email, consent, the seven intake answers in plain words, the page it came from, and the pack version. Eval runs are not recorded.

Only rows with **Consent to updates = Yes** may receive the results email or Nautilus updates. Keep the Sheet shared with Nautilus staff only.

Sheet setup (once):
1. Open the Sheet, then **Extensions > Apps Script**. Replace the editor's contents with `apps-script/Code.gs` and save.
2. **Project Settings** (gear icon) **> Script properties**: add `LEADS_SECRET` (a long random string) and `SEND_FROM` (`steve.ditto@nautilushealth.org`). The report is sent from SEND_FROM if it is a "Send mail as" address of the Google account that deployed the script; otherwise from that account, with SEND_FROM as the reply-to address.
3. **Deploy > New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**. Authorize when asked. Copy the **Web app URL**.
4. Give the Worker the URL and secret: `npx wrangler secret put SHEET_WEBHOOK_URL` and `npx wrangler secret put SHEET_SECRET` (same value as step 2).

If you change the script later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

If the Sheet can't be reached, the user still gets their questions and the lead is kept in D1. To check and re-send:

```bash
npx wrangler d1 execute pbm-readiness --remote --command "SELECT id, lead, error, datetime(created_at/1000,'unixepoch') FROM failed_leads"
```

Copy those rows into the Sheet, then `DELETE FROM failed_leads WHERE id IN (...)`.

## Embedding on nautilushealth.org/PBM

```html
<iframe id="pbm-readiness" src="https://nautilus-health.github.io/pbm-readiness/" title="PBM Rule Readiness Check" style="width:100%;height:1400px;border:0"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "https://nautilus-health.github.io") return;
  if (e.data && e.data.type === "pbm-readiness-height") {
    document.getElementById("pbm-readiness").style.height = e.data.height + "px";
  }
});
</script>
```

The page reports its height, so the frame grows with the results and the conversation and never scrolls inside itself.

## Updating the knowledge pack

1. Edit or replace `knowledge/pack-v1.2.md` (for a new version, add `pack-v1.3.md` and change the import in `worker/src/index.js`).
2. Bump `PACK_VERSION`, run the eval, get counsel sign-off on changed positions.
3. `npx wrangler deploy`.
