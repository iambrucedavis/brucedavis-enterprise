# Grounded recruiter assistant — review setup

This is a review-branch addition to the existing static portfolio. Do not merge or deploy to production without Bruce's approval. The site is still HTML/CSS/browser JavaScript; one Vercel Node.js function handles `POST /api/recruiter`.

## Configuration required before live answers

No OpenAI or Upstash credentials were available during implementation. The assistant deliberately returns a recoverable unavailable response until **all five** required values are configured. It never substitutes fixture answers or bypasses shared limits.

Add these directly in [Vercel environment settings](https://vercel.com/iambrucedavis/brucedavis-enterprise/settings/environment-variables), scoped to **Preview** and branch `review/grounded-recruiter-assistant` first:

| Name | Value to enter securely |
| --- | --- |
| `OPENAI_API_KEY` | A project API key created in the [OpenAI dashboard](https://platform.openai.com/api-keys). |
| `OPENAI_MODEL` | An account-accessible Responses model with strict structured output. `gpt-5.4-mini` is documented as supporting Responses, structured output, and default `none` reasoning; actual account access and answer quality still require a live check. |
| `UPSTASH_REDIS_REST_URL` | The HTTPS REST URL from your own [Upstash Redis console](https://console.upstash.com/), ending in `.upstash.io`. Use a separate Preview database if possible. |
| `UPSTASH_REDIS_REST_TOKEN` | That database's normal read/write REST token. A read-only token cannot run the limiter. |
| `ASSISTANT_RATE_LIMIT_SECRET` | A fresh random secret of at least 32 characters, kept only in hosting secrets. Generate locally, for example with `openssl rand -base64 32`, and paste directly into Vercel. Do not send it through chat. |

1. Create the OpenAI project/key and choose a compatible account-accessible model in the provider's secure dashboard. Review the provider's billing and data settings yourself; no paid resources were created by this implementation.
2. Create or choose an Upstash Redis database in its secure dashboard. Review the selected plan before confirming it; do not approve a paid plan unless you intend to.
3. Paste the values directly into the branch-scoped Vercel settings above. Never commit a populated `.env` file or put a key in browser code.
4. Redeploy the **Preview branch**, since existing deployments do not acquire newly added environment values.
5. Verify the actual model and hosted Redis path using the acceptance checklist before approving a production release.
6. Only after approval, configure separate Production-scoped values, merge, deploy, and verify the assistant on `www.iambrucedavis.com`.

Official references: [Vercel Node.js handler API](https://vercel.com/docs/functions/runtimes/node-js), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [OpenAI data handling](https://developers.openai.com/api/docs/guides/your-data), [Upstash REST commands](https://upstash.com/docs/redis/features/restapi).

## Limits and failure behavior

The Redis Lua admission script atomically applies the limits across serverless instances. There are no process-local production quota counters.

| Optional variable | Default | Hard maximum |
| --- | --- | --- |
| `ASSISTANT_VISITOR_PER_MINUTE` | 5 accepted questions per IP-derived visitor per minute | 10 |
| `ASSISTANT_VISITOR_PER_DAY` | 20 accepted questions per visitor per UTC day | 100 |
| `ASSISTANT_GLOBAL_CALLS_PER_DAY` | 50 model calls per environment per UTC day | 200 |
| `ASSISTANT_GLOBAL_TOKEN_ALLOWANCE` | 200,000 conservative reserved token units per environment per UTC day | 1,000,000 |
| `ASSISTANT_MAX_CONCURRENT` | 2 model requests globally; 1 per visitor | 5 |

The token allowance reserves UTF-8 request bytes plus a framing allowance and the 192-token model output cap. It is a conservative admission bound, not a billed-token measurement or a dollar-denominated provider budget. Reservations are never refunded, including failures. Set an additional provider project spend limit in the provider dashboard if needed. Invalid limit values fail closed.

Only questions with candidate evidence can spend model budget or acquire a model-concurrency lease. Unsupported and rejected questions still consume visitor request quota. Model timeout: 10 seconds. Each Redis operation: 2 seconds. Client timeout: 16 seconds. Function maximum: 20 seconds. Concurrency leases expire after 25 seconds and are removed by later admissions if cleanup fails. No automatic provider retries multiply costs.

Vercel supplies `x-vercel-forwarded-for`; the application never accepts a client-specified visitor ID. Visitor keys use a daily HMAC of that IP. People behind one shared IP can share a quota; this is a documented privacy/rate-limit tradeoff. Missing IP information shares an `unknown` quota instead of bypassing limits. Preview and Production counters have separate namespaces. All Preview deployments using one database share the Preview budget.

## Grounding and source review

`server/assistant/evidence.mjs` contains 18 curated records with stable IDs, short titles, approved factual prose, and local citation destinations. The model selects at most two candidate IDs using a strict schema. The server validates the full response, membership, relevance candidate set, duplicates, and citation destinations. It then returns catalog prose, never model-written prose or URLs. The exact unsupported answer is `I don’t have verified information about that`.

Sources reviewed:

- Current primary resume, SHA-256 `d44431f375742c92fb6829a330fcb86b9b21d788bb1af5e4e5ba8302073f9338`, and public HTML resume.
- Approved employer cases and capability copy at website base commit `56f5b4dbbdbc570e392f84c2dd536984a22295ee`.
- Personal prototype pages and `iambrucedavis/automation-infrastructure-portfolio`, remote main `a1a9d048e501ff0130319a7346c5cc9bb4bf54f9`: PAM analyzer and infrastructure/change READMEs and implementation boundaries. Pre-existing modified generated outputs in the sibling checkout were not altered.
- `iambrucedavis/day-one` README blob `a91d11ae066541fecff737d0657fa14a838cb55e`, reviewed only for personal-project scope. Its key handling and framework were not reused.
- Bruce's supplied Replit reference code and adaptation requirements. The separate Replit workspace itself was not accessed. No `@workspace/...` imports, Replit packages, or Replit development backend are used.

Regex rejection and lexical candidate filtering are defense in depth, not a claim that regex solves prompt injection. The principal output boundary is validated IDs followed by immutable curated prose. Relevance selection is still probabilistic and needs live-model evaluation. Facts outside this deliberately small catalog should produce the unsupported answer, not adjacent positive facts.

## Privacy

Only the current question is sent, not conversation history. Chat history is bounded to eight turns in page memory and cleared on Clear chat and page exit. No localStorage, sessionStorage, chat database, question URL, or application content logging is used. UI text is rendered with `textContent`, not HTML. Source URLs are constrained to reviewed local pages.

Redis stores no chat text or raw IP addresses: only daily HMAC visitor keys, counts, token reservations, and random short-lived concurrency lease IDs. Minute keys expire within 120 seconds; daily counters expire within 48 hours; active leases expire within 25 seconds (the sorted-set container within 60 seconds).

The app sends `store:false` to OpenAI. This does **not** promise zero provider retention: provider abuse-monitoring and account-specific data policies still apply. Review the actual account's settings before production. Vercel/Upstash platform request metadata policies also apply. No site analytics/session-replay integration was found on the homepage; the assistant region includes privacy masking attributes for common replay tools. Future analytics or replay installations must explicitly exclude the assistant region and API bodies.

## Testing

`npm test` runs the backend tests with a deterministic fake provider. Real Redis script tests require a **dedicated disposable local Redis** and `REDIS_TEST_PORT`/`REDIS_TEST_CLI`; they skip explicitly when those are absent. Do not point them at a production database. Each run has an isolated key namespace.

`npm run preview` starts a local server using the real handler and whatever credentials you configure locally. Without them, it safely shows unavailable. `node tools/preview-server.mjs --fixtures` is a **local UI-only fixture server** clearly labeled as not connected to a live model. It is never a deployed answer path. The Vercel build has no route to these test fixtures.

The reviewed run passed 63 backend, catalog/privacy, and real-local-Redis tests. UI fixtures covered all four starters, two-source answers, loading, unavailable, rate limits, retry without losing the question, Clear chat, exact unsupported text, 1,000-character input, safe text rendering, keyboard focus, and desktop/390 px layout. Provider calls and hosted Upstash integration remain untested until real credentials are configured.

Before release, run the real preview through all four starters, supported background/fit/skills/projects/impact/leadership questions, unsupported compensation/availability/invented metrics, injection attempts, provider failure recovery, hosted quota/concurrency denial, source links, resume downloads, contact, case anchors, and PAM report filtering. Do not mark live-model behavior passed based on fixture results.
