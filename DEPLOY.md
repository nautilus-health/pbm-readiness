# Deploying the question feature

The page on GitHub Pages works without the Worker: results show, and the question panel says "coming next". The question feature turns on when `WORKER_URL` in `index.html` points at a deployed Worker.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html` | The tool. `WORKER_URL` near the Q&A section switches questions on. Testers can also add `?api=https://<worker-url>` to the page address. |
| `knowledge/pack-v1.0.md` | The only material Claude answers from: the Nautilus checklist, the regulation text with page numbers, selected preamble passages, and the open-items list. |
| `worker/` | Cloudflare Worker: `POST /lead` (email + intake answers), `POST /ask` (one answer), `GET /health`. |
| `worker/schema.sql` | D1 tables: `leads`, `sessions`, `asks`. |
| `eval/questions.json`, `eval/run.mjs` | 47 test questions with automatic checks, and the runner that writes a review report for counsel. |

## One-time setup (Cloudflare)

You need Node.js installed. From the repo folder:

```bash
cd worker
npx wrangler login
npx wrangler d1 create pbm-readiness          # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute pbm-readiness --remote --file schema.sql
npx wrangler secret put ANTHROPIC_API_KEY      # paste the Claude API key
npx wrangler secret put IP_SALT                # any long random string
npx wrangler secret put EVAL_TOKEN             # any long random string; lets the eval skip rate limits
npx wrangler deploy
```

`deploy` prints the Worker address, for example `https://pbm-readiness.<account>.workers.dev`. Check it with `<address>/health`.

## Test before switching on

1. Open `https://nautilus-health.github.io/pbm-readiness/?api=<worker address>` and ask a few questions.
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
| `PACK_VERSION` | `1.0` | Bump with every knowledge-pack change. Each answer is logged with the version used. |
| `ALLOWED_ORIGINS` | GitHub Pages, nautilushealth.org, contractxray.com | Pages that may call the Worker. |
| `MAX_QUESTIONS` | `10` | Per email session. |
| `IP_HOURLY_LIMIT` | `30` | Questions per network per hour. |
| `LOG_QUESTIONS` | `true` | Stores question text for the eval period. Set to `false` at launch, per the privacy section of the spec. |

## Leads

```bash
npx wrangler d1 execute pbm-readiness --remote --command "SELECT email, consent, profile, source, datetime(created_at/1000,'unixepoch') FROM leads ORDER BY created_at DESC"
```

Only rows with `consent = 1` may receive the results email or Nautilus updates. Eval runs use `eval@nautilushealth.org`; delete those rows before exporting.

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

1. Edit or replace `knowledge/pack-v1.0.md` (for a new version, add `pack-v1.1.md` and change the import in `worker/src/index.js`).
2. Bump `PACK_VERSION`, run the eval, get counsel sign-off on changed positions.
3. `npx wrangler deploy`.
