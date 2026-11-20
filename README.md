# Bhorsha (ভরসা)

**Read the trail. Build the trust.** · হিসাব পড়ে, ভরসা গড়ে।

**Live demo:** https://bhorosha.vercel.app

Bhorsha brings fair, fast credit to the small shops of Bangladesh that banks cannot see. **AI agents decide inside a policy the licensed lender owns; the lender sets the policy, reads the audit log and can pause the AI.** Every decision is explained, every number is traceable, and nothing is decided on a guess.

A shop's mobile-money statement, bills, a Bangla note and, for online sellers, courier settlement and order-log CSVs become a **viability file**. The file shows clearly what is **checked** (matched against the money trail) and what the **owner says**. Ten named agents do the work, and code around each one validates, clamps and computes every number:

| Agent | Job |
| --- | --- |
| **Intake** | Takes the owner's application (segment, statement, documents, online CSVs) and redacts personal details before any model call. |
| **Verifier** | Matches bills to wallet debits and courier payouts to wallet credits; anything it cannot confirm becomes a friendly Bangla question to the owner. |
| **Contract reader** | Reads the loan contract: principal, rate, tenor, early and late repayment clauses. Flags any clause it is unsure about. Code validates the fields and enforces the Tk 1,000,000 and 12-month limits; an unsure contract holds the case (`hold_need_evidence`) until the lender confirms the terms. |
| **Underwriter** | Rules + calibrated model + conformal prediction; a fail-safe decision: `approved_with_conditions`, `declined_with_plan` or `hold_need_evidence`. It approves when every gate passes, and the model can only add caution, never remove it. |
| **Counter-offer** | When a request breaks a limit, writes the `declined_with_plan` counter-offer (smaller amount or shorter tenor) with the reasons. Code clamps the offer to the limits and to the largest amount the rules still judge viable. The owner can accept it on their page. |
| **Pricing** | Sets the early-repayment rebate (default 20% of remaining interest) and the late penalty (default +2 points a year) from the contract and the borrower's history. Code clamps both into the lender's min and max and computes the amounts. |
| **Fee explainer** | Explains in plain Bangla and English how interest splits between the investors (bank rate + 0.25%), Bhorsha (8%, 8.5% or 9% of interest by tenor) and the lender. Code supplies the figures and refuses any setup where the borrower rate is below the investor rate plus Bhorsha's fee. |
| **Payment matcher** | Matches incoming bKash or bank payments to the right loan when the reference is missing, the amount is partial or the timing is odd, with a confidence score. Code checks the webhook's HMAC signature and classifies each payment as early, on time or late; below the confidence threshold the payment waits in the lender's review queue and is not applied. |
| **Servicer** | Writes receipts, early-settlement quotes and late notices in plain language (code supplies every amount), messages the owner, offers a repayment-date change when a shop hits a rough patch, and posts investor updates. |
| **Watchman** | After funding: weekly for hybrid and digital-first shops, monthly for cash-led shops, festival-aware. It also reads every late or early repayment and decides whether it is a real warning or a seasonal pattern; code stores the flag and routes it. |

Every decision records `decided_by: "Bhorsha AI, policy vN"`, its gates and its evidence ids. Loans run up to Tk 1,000,000 and 12 months at a 14% borrower rate (all set in the lender's policy). Above the autonomy cap (default 300,000 BDT), money is released in tranches. A circuit breaker pauses the AI automatically if the hold rate or default rate crosses the lender's limits.

Shops come in three segments: **cash_led**, **hybrid** and **digital_first**.

> **Demo data.** The demo runs on synthetic shops, investors and loans, labelled on every page; investor pages are marked SIMULATION. Bhorsha never holds money: a licensed partner is the lender of record, and no return is ever promised.

## Try it

Open **https://bhorosha.vercel.app** and choose **I'm a lender** or **I'm an investor** to create an account, or log in with a demo account (password `bhorsha-demo`):

| Account | Email |
| --- | --- |
| Lender policy owner | lender@demo.bd |
| Investor (simulation, verified) | investor@demo.bd |
| Investor (simulation, new) | newinvestor@demo.bd |

Shop owners need no account. Each shop has a private link (`/owner/<token>`), opened from its case page or reached after applying at `/apply`.

## The demo path

1. Log in as **lender@demo.bd**. The **Lender console** shows the active policy version, the pause switch, the circuit breaker, every AI decision and the audit log.
2. Open **Rahima Tea and Grocery**. The **agent trace** shows Intake → Verifier → Underwriter → Servicer at work. One bill is matched to its wallet payment, and the other became a Bangla question to the owner. Decision: `approved_with_conditions`.
3. Open **Rafi Attar and Decants** (hybrid). Courier payouts are matched to wallet credits net of fees, payout delays and partial remittances. The extra evidence gives Rafi a tighter likelihood band than Rahima, plus a supplier-invoice condition.
4. **Sultana**: a large loan, released safely in three tranches starting at 300,000. **Tania**: the AI catches a statement that does not add up and holds it.
5. On a held case, open **Owner's link**. The owner sees a plain Bangla explanation, answers questions and can **Resubmit with new evidence**.
6. **Mitu Beauty Corner**: the Contract reader is unsure about a late clause "as agreed verbally". The case is held; under **Loan terms and repayments**, set the figures and press **Confirm**: the agents run again and the case is approved, priced and explained.
7. **Hasan Hardware Store** asks for Tk 1,500,000 over 24 months. The Counter-offer agent offers a smaller loan over 12 months; open **Owner's link** and press **Accept this offer**.
8. **Watchlist → Simulate next week / next month.** Karim Pharmacy's sales slip, and the Watchman raises a watch, then a call. Each funded loan's instalment arrives through the signed payment webhook: Karim's late payment is read as a real warning, Jahan's as a seasonal pattern, and Rafi's payment with no reference waits in the **Repayments** review queue. Jahan's seasonal dip stays calm, where a fixed 30% rule would have raised a false alarm.
9. **Repayments**: apply or reject the queued payment, or **Send a test payment** (leave the reference empty for the AI to match it, or tick *wrong signature* to see it refused).
10. Log in as **investor@demo.bd**. Listings show only approved files with the interest split, and the portfolio feed carries live Servicer updates.

## Test it from scratch

`test-kit/` has everything to test Bhorsha the way a shop owner, lender and investor would, with a step-by-step guide (`test-kit/README.md`): statements (healthy, tampered, too short), an online seller's statement with courier and order files, two bill photos (one matches the wallet, one was paid in cash), a Bangla owner note and three loan contracts (unclear clause, fixed terms, wrong amount). New users sign up at **/signup** as a lender or an investor.

## Payment webhook

Payments arrive at `POST /api/payments/webhook` with the header `x-bhorsha-signature`: the hex HMAC-SHA256 of the raw body with `PAYMENT_WEBHOOK_SECRET`. Body: `{ "event_id", "channel": "bkash" | "bank", "amount_bdt", "received_at", "reference", "payer_label" }`. A wrong signature gets 401; a repeated `event_id` is ignored.

## Results (synthetic evaluation, cohort v2.1)

The evaluation plan and its pass marks were committed **before** any run (`EVAL_PROTOCOL.md`), and `ml/model/eval.json` records that commit hash, so every number can be checked.

- **Matching:** 99.9% recall with a 0.2% false-check rate across about 94,000 courier payouts.
- **Fail-safe:** 100% of trap cases blocked in every segment (forged statements, short history, unanswered evidence, paused AI).
- **Circuit breaker:** trips exactly at the limit, with zero approvals while paused.
- **Watchman:** warns a median of **3 months** early for cash-led shops and **6 weeks** early for online shops, with far fewer false alarms than a fixed 30% rule (0.68 vs 0.88 and 3.1 vs 9.5 per borrower-year).
- **Safety:** zero personal-data leaks in redaction tests; every seeded bad AI output is rejected by the validator.
- **Tamper detection, counterfactual conditions and the investor allocator** all meet their marks.

The full per-segment results, with confidence intervals, are in `ml/model/eval.json` (`npm run eval` regenerates them).

## Roadmap

- **Pilot with a licensed lender:** load the lender's own credit policy into the agents and run in shadow mode, with a regulator's review of the AI decisions.
- **Real courier and marketplace data:** confirm the formats with Pathao, RedX, Steadfast, Paperfly and marketplace sellers, and calibrate the hybrid model on real sellers.
- **Public real-data benchmarks:** Olist (e-commerce sellers) and Berka (real loan outcomes) are prepared in the protocol.
- **Faster approvals for healthy online shops:** let owners answer payout questions at application time, so fewer good shops wait.
- **Sharper model:** more features from order logs and returns to strengthen the model beyond the transparent rules.

## Run it locally

Requirements: Node 20 or later, MongoDB on `localhost:27017` (or any `MONGODB_URI`), and Python 3.10 or later with scikit-learn (only for `train` and `eval`).

```bash
npm install
cp .env.example .env        # then set JWT_SECRET; the AI key is optional
npm run seed                # fills the database with the nine demo shops (fixed seeds)
npm run dev                 # client http://localhost:5173, API http://localhost:4000
```

The API seeds itself when the database is empty, and `npm run seed` restores the exact starting state at any time.

```bash
npm test             # Vitest: parsing, matching, checks, rules, decision gates, redaction, validator, forecasting, allocator
npm run build        # builds server and client
npm run check:seed   # asserts the 26 seed expectations (decisions, contracts, counter-offer, pricing, webhook, repayments) and that every seed gives the same state
npm run ai:check     # shows the AI provider and whether a key is set (never prints the key)
npm run train        # cohort v2.1 + training -> ml/model/model.json
npm run eval         # cohort v2.1 + training + every test in EVAL_PROTOCOL.md -> ml/model/eval.json
```

`pip install scikit-learn numpy pandas` covers the Python side.

### Environment variables

See `.env.example`. Set `AI_PROVIDER=gemini` with a free Google AI Studio `GEMINI_API_KEY`, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`. Without a key, the app keeps working in a labelled **DEMO FALLBACK** mode, so the demo never breaks. `/api/health` reports the database, model and AI mode.

## Deployment

Live on Vercel as one project: `vercel.json` builds the server and the client, serves `client/dist`, and runs the Express API as a serverless function (`api/index.js` → `server/src/vercel.ts`), backed by MongoDB Atlas. To deploy your own copy:

1. Create a MongoDB Atlas database (Vercel → Storage → MongoDB Atlas adds `MONGODB_URI` automatically).
2. Add `JWT_SECRET`, `COOKIE_SECURE=true`, `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite`, `GEMINI_API_KEY` and (optional) `PAYMENT_WEBHOOK_SECRET` in the project settings.
3. Run `vercel deploy --prod` from the repo root.

## Built with

- **AI models:** Gemini through its REST API, or Claude (Anthropic) through the official `@anthropic-ai/sdk`. They read bills and notes, cross-check documents, write the file and owner messages in Bangla and English, answer questions about a file and read check-ins. Inputs are redacted first, outputs are validated with Zod and our number, citation and wording validator, and every call is logged with its agent and run id.
- **Libraries:**
  - Server: Express, Mongoose, Zod, Papa Parse, bcryptjs, jsonwebtoken, multer, cookie-parser, cors, dotenv.
  - Client: React, React Router, Vite, Tailwind CSS, Framer Motion, three.js.
  - Tooling: Vitest, tsx, TypeScript.
  - Python: scikit-learn, NumPy, pandas.
- **Fonts** (SIL Open Font License, bundled through Fontsource): Noto Serif Bengali, Noto Sans Bengali, Fraunces, Inter, JetBrains Mono.
- **Data:** the demo shops, statements, bills, notes, courier settlements, order logs, investors, outcomes and the 3,000-shop evaluation cohort are generated by scripts in this repository with fixed seeds. Background figures in the pitch come from public news sources listed in `BRIEF.md`.

## Layout

```
client/              React + Vite + Tailwind (all screens)
server/              Express + Mongoose API
  src/lib/           pure logic: parsing, matching, checks, features, rules, decide (gates), loan terms, breaker, forecast, festivals, redaction, validator, model
  src/services/      agent pipeline (casefile), verifier, loan agents, policy, watchman + servicer, AI
  src/scripts/       cohortV2, evalV2, checkSeed, aicheck
api/                 Vercel serverless entry
test-kit/            files and a step-by-step guide for a full manual test
ml/                  train_v2.py (scikit-learn), model/ (model.json, eval.json, earlier runs)
brand.config.json    name and tagline, used everywhere
EVAL_PROTOCOL.md     tests and pass marks, committed before any evaluation run
DECISIONS.md         design choices
```

Team Excuse Me · Kha Merul Badda, Dhaka
