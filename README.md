# Bhorsha (ভরসা)

**Read the trail. Build the trust.** · হিসাব পড়ে, ভরসা গড়ে।

Bhorsha is a prototype for small-business lending in Bangladesh. **AI agents decide inside a policy the licensed lender owns; the lender sets the policy, reads the audit log and can pause the AI.** There is no branch manager or loan officer in the loop.

A shop's mobile-money statement, bills, a Bangla note and, for online sellers, courier settlement and order-log CSVs become a **viability file**. The file separates what is **checked** (matched against the money trail) from what the **owner says**. Five named agents do the work:

| Agent | Job |
| --- | --- |
| **Intake** | Takes the owner's application (segment, statement, documents, online CSVs) and redacts it before any model call. |
| **Verifier** | Matches bills to wallet debits and courier payouts to wallet credits; anything weak or unmatched becomes a Bangla question to the owner. |
| **Underwriter** | Rules + calibrated model + conformal "not sure"; a fail-safe decision: `approved_with_conditions`, `declined_with_plan` or `hold_need_evidence`. It approves only when every gate passes, and the model may only make a verdict more cautious. |
| **Watchman** | After funding: weekly for hybrid and digital-first shops, monthly for cash-led shops, with festival seasonality. |
| **Servicer** | Messages the owner, offers a repayment-date change at call level, and posts investor updates. |

Every decision records `decided_by: "Bhorsha AI, policy vN"`, its gates and its evidence ids. Above the autonomy cap (default 300,000 BDT), money is released in tranches. A circuit breaker pauses the AI automatically if the hold rate or simulated default rate crosses the policy's limits.

Shops come in three segments: **cash_led**, **hybrid** and **digital_first**.

> **All data is synthetic.** No real borrower, lender, investor or loan is involved. Every page carries the synthetic-data label, and investor pages also say SIMULATION. Bhorsha never holds money; in the design, a licensed partner is the lender of record. No projected return is ever shown.

## Run it locally

Requirements: Node 20 or later, MongoDB on `localhost:27017` (or any `MONGODB_URI`), and Python 3.10 or later with scikit-learn (only for `train` and `eval`).

```bash
npm install
cp .env.example .env        # then set JWT_SECRET; the AI key is optional
npm run seed                # fills the database with the seven demo shops (fixed seeds)
npm run dev                 # client http://localhost:5173, API http://localhost:4000
```

The API seeds itself if the database is empty. The lender console has a **Reset demo data** button; Seed and Reset give the same state.

| Account | Email | Password |
| --- | --- | --- |
| Lender policy owner | lender@demo.bd | bhorsha-demo |
| Investor (simulation, verified) | investor@demo.bd | bhorsha-demo |
| Investor (simulation, not yet verified) | newinvestor@demo.bd | bhorsha-demo |

Shop owners need no account. Each shop has a private token link (`/owner/<token>`), opened from its case page or reached after applying at `/apply`.

Other commands:

```bash
npm test             # Vitest: parsing, matching, checks, rules, decision gates, redaction, validator, forecasting, allocator
npm run build        # builds server and client
npm run check:seed   # asserts the seed expectations and that two seeds give the same state
npm run ai:check     # shows the AI provider and whether a key is set (never prints the key)
npm run train        # cohort v2.1 + training -> ml/model/model.json
npm run eval         # cohort v2.1 + training + every test in EVAL_PROTOCOL.md -> ml/model/eval.json (/evaluation)
```

`pip install scikit-learn numpy pandas` covers the Python side.

### Environment variables

See `.env.example`. Set `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or `AI_PROVIDER=gemini` with a free Google AI Studio `GEMINI_API_KEY`. Without a key, every AI step uses a labelled **DEMO FALLBACK**: canned readings for the seeded documents, rule-based note reading and template text. If `ml/model/model.json` is missing, verdicts are **rules only**. `/api/health` reports the database, model and AI mode.

## The demo path

1. Log in as **lender@demo.bd**. The **Lender console** shows the active policy version, the pause switch, the circuit breaker, all AI decisions and the audit log.
2. Open **Rahima Tea and Grocery**. The **agent trace** shows Intake → Verifier → Underwriter → Servicer. One bill is matched to a wallet debit and one is unmatched, which raised a Bangla question to the owner. The decision is `approved_with_conditions`.
3. Open **Rafi Attar and Decants** (hybrid). Courier payouts are matched to wallet credits (net of fees, lag up to 10 days, partial remittances), the band is narrower than Rahima's, and there is a supplier-invoice condition.
4. **Sultana**: approved above the autonomy cap, so it is released in three tranches with a 300,000 first tranche. **Nasir** and **Tania**: held, and Tania's statement does not reconcile.
5. On a held case, open **Owner's link**. The owner sees a Bangla explanation, answers questions (stored as "owner says") and can **Resubmit with new evidence**.
6. Go to **Watchlist** and click **Simulate next week / next month**. Karim Pharmacy goes to watch and then call. The Servicer messages the owner and offers a repayment-date change. Jahan's lean season stays inside its band, while a fixed 30% rule would have alarmed.
7. Log in as **investor@demo.bd**. Listings show only `approved_with_conditions` files, and the portfolio feed carries Servicer updates, all labelled SIMULATION.
8. Open **/evaluation**: per-segment results with confidence intervals, the protocol commit hash, and the runs below their pass marks.

## Honest limits

- **Results are synthetic unless labelled "Public real data".** No public real dataset has been run yet: Olist and Berka are listed as planned because `data/olist/` and `data/berka/` are not present.
- **The hybrid generator rests on assumptions** (online share, courier fees, payout lag, partial remittances, returns, festival lift), written in `EVAL_PROTOCOL.md` and not yet checked against real hybrid sellers.
- **Courier settlement and order-log formats are our own;** real Pathao, RedX, Steadfast, Paperfly and marketplace exports are unconfirmed.
- **The fail-safe design holds files it is unsure about, so some healthy shops are held.** We expected cash-led shops to be held more often, because less of their trade is visible. On the synthetic cohort the opposite was measured. Healthy cash-led shops were approved 23% of the time, hybrid 0% and digital-first 9%; after the owner answers the payout questions, the figures are 23%, 6% and 14%. This trade-off is reported on `/evaluation` (T3) and not hidden.
- **Real deployment needs** the lender's own policy and a regulator's review of AI decisions made inside it. Neither is done; the policy here is a demo default.

## Evaluation summary (cohort v2.1, synthetic)

`EVAL_PROTOCOL.md` was committed before any v2 run, and `/evaluation` shows its commit hash. Pass marks are never changed. The first run exposed a generator bug: statements ran past the window. The fixed generator is versioned **cohort-v2.1**, and the v2.0 and v1 runs are kept on `/evaluation` as superseded runs.

- **Meets the mark:**
  - **Matching:** recall 0.999, false-checked 0.2%, n ≈ 94,000 payouts.
  - **Fail-safe traps:** 100% not approved in every segment.
  - **Circuit breaker:** trips exactly when crossed, with no approvals while paused.
  - **Watchman:** median lead time of 3 months for cash-led and 6 weeks for online shops, with fewer false alarms than a fixed 30% threshold (0.68 vs 0.88 and 3.1 vs 9.5 per borrower-year).
  - **Other checks:** tamper detection, counterfactual validity, redaction (zero leaks), the validator and the allocator.
- **Below the mark, reported:**
  - **Pooled Brier:** the model does not beat the logistic baseline (0.189 vs 0.182), though both beat the rules (0.237).
  - **Conformal coverage:** within 3 points of 90% only for digital-first. It is 94.8% for cash-led and 85.5% for hybrid; the held-out test conditions differ from the calibration data.
  - **What this means:** the model's signal is weak (AUC about 0.57), so it is only allowed to add caution.
- None of this is real-world accuracy.

## External contributions

- **AI models:** Claude (Anthropic, `claude-opus-5-5` by default) through the official `@anthropic-ai/sdk`, or Gemini through its REST API. They read bills and notes, cross-check documents, phrase the file and owner messages, answer questions about a file and read check-ins. Inputs are redacted first, outputs are validated with Zod and our number, citation and forbidden-word validator, every call is logged with its agent and run id, and each call has a time limit and a fallback.
- **Libraries:**
  - Server: Express, Mongoose, Zod, Papa Parse, bcryptjs, jsonwebtoken, multer, cookie-parser, cors, dotenv.
  - Client: React, React Router, Vite, Tailwind CSS, Framer Motion, three.js.
  - Tooling: Vitest, tsx, TypeScript.
  - Python: scikit-learn, NumPy, pandas.
- **Fonts** (SIL Open Font License, bundled through Fontsource): Noto Serif Bengali, Noto Sans Bengali, Fraunces, Inter, JetBrains Mono.
- **Data:**
  - **All synthetic:** every shop, statement, bill, note, courier settlement, order log, investor and outcome, and the 3,000-shop cohort, generated by scripts in this repository with fixed seeds.
  - **Counterparty types** (customer, supplier, personal, utility) are seeded in the demo; real statements would need classification.
  - **Background figures** in the pitch come from public news sources listed in `BRIEF.md`.

## Layout

```
client/              React + Vite + Tailwind (all screens)
server/              Express + Mongoose API
  src/lib/           pure logic: parsing, matching, checks, features, rules, decide (gates), breaker, forecast, festivals, redaction, validator, model
  src/services/      agent pipeline (casefile), verifier, policy, watchman + servicer, AI
  src/scripts/       cohortV2, evalV2, checkSeed, aicheck
ml/                  train_v2.py (scikit-learn), model/ (model.json, eval.json, superseded runs)
brand.config.json    name and tagline, used everywhere
EVAL_PROTOCOL.md     tests and pass marks, committed before any evaluation run
DECISIONS.md         choices the brief left open
```

## Deployment (Vercel, one project)

The website and the API deploy together as one Vercel project: `vercel.json` builds the server and the client, serves `client/dist`, and runs the whole Express API as one serverless function (`api/index.js` → `server/src/vercel.ts`). Same address, so no CORS or cross-site cookie setup is needed.

1. Create a free MongoDB Atlas cluster and allow access from anywhere (`0.0.0.0/0`).
2. Seed it once from your machine (faster than seeding on the first visit): `$env:MONGODB_URI="<atlas uri>"; npm run seed`
3. In the Vercel project settings, add `MONGODB_URI`, `JWT_SECRET` (new, long, random), `COOKIE_SECURE=true`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.1-flash-lite`. Leave `VITE_API_URL` unset.
4. `vercel login`, then `vercel deploy --prod` from the repo root.

Limits: one request may run up to 60 seconds, uploads are capped near 4.5 MB by Vercel, and on Vercel the seed writes its sample CSVs to the temp folder (the committed copies are served if it is empty).
