# Bhorsha (ভরসা)

**Read the trail. Build the trust.** · হিসাব পড়ে, ভরসা গড়ে।

Bhorsha is a prototype of decision support for small-business lending in Bangladesh. It turns a shop's mobile-money statement, bill photos and a Bangla note into a one-page **viability file**. The file separates what is **checked** from what the **owner says**, and gives a verdict with a likelihood band, a likely cause, conditions, a staged release plan and a recovery plan. A bank manager makes the decision. After funding, a seasonal forecasting **watchman** warns when a shop falls below its expected range. A simulated investor view shows the same evidence in plain language.

> **All data is synthetic.** No real borrower, lender, investor or loan is involved. Every page carries the synthetic-data ribbon, and the investor pages also say SIMULATION. Bhorsha never holds money: in the design, a licensed partner is the lender of record.

## Run it locally

Requirements: Node 20 or later, a MongoDB on `localhost:27017` (or any `MONGODB_URI`), and Python 3.10 or later with scikit-learn (only for `train` and `eval`).

```bash
npm install
cp .env.example .env        # then set JWT_SECRET; the AI key is optional
npm run seed                # fills the database with the six demo shops (fixed seeds)
npm run dev                 # client http://localhost:5173, API http://localhost:4000
```

The API seeds itself if the database is empty. Managers also get a **Reset demo data** button on the dashboard.

| Account | Email | Password |
| --- | --- | --- |
| Branch manager | manager@demo.bd | bhorsha-demo |
| Loan officer | officer@demo.bd | bhorsha-demo |
| Investor (simulation, verified) | investor@demo.bd | bhorsha-demo |
| Investor (simulation, not yet verified) | newinvestor@demo.bd | bhorsha-demo |

Other commands:

```bash
npm test          # Vitest: parsing, checks, rules, demo verdicts, redaction, validator, forecasting, allocator
npm run build     # builds server and client
npm run train     # generates the synthetic cohort and trains the model -> ml/model/model.json
npm run eval      # cohort + training + every component's evaluation -> ml/model/eval.json (/evaluation)
```

`pip install scikit-learn numpy pandas` covers the Python side.

### Environment variables

See `.env.example`. With no `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY` when `AI_PROVIDER=gemini`), every AI step uses a labelled **DEMO FALLBACK**: canned readings for the seeded documents, rule-based note reading and template text. If `ml/model/model.json` is missing, verdicts are **rules only**. `/api/health` reports the database, model and AI mode.

## The 3-minute demo path

1. Landing page, then log in as the manager and open the **dashboard**.
2. **Rahima Tea and Grocery**: the bill and note read by AI (or DEMO FALLBACK), the officer ticking a field, the coverage ring, the proof ribbons, the verdict and band, the cause, the conditions and the recovery plan.
3. **Approve** with a condition and a written reason.
4. **Watchlist → Simulate next month** (twice): Karim Pharmacy falls below its band (watch, then call), with a probable cause and a supportive action. Jahan Fish Trader's lean months stay inside the band, while a fixed 30% rule would have alarmed.
5. Log in as the investor: the **portfolio** feed shows the pharmacy update, labelled simulation.
6. **Tania Online Clothing**: the running balance does not reconcile; then the **/evaluation** page.
7. **Money structure**: the "What must be true in real life" checklist, every item not yet done.

## What works, what is a stub, what is planned

- **Working:** the intake wizard, statement parsing, consistency checks (balance continuity, duplicates, round-number runs, total mismatch, first-digit test, isolation-forest score), coverage, rules, proof labels, the viability file (Bangla and English, prints to A4), refinance fit check, counterfactual conditions and tranche plan, rules-versus-model disagreement notice, decision record with audit trail, watchman with forecast intervals, flags, watchlist, intervention log, outcome capture API, redaction, AI bill and note reading with officer confirmation, cross-document checks, AI phrasing with validator and template fallback, Ask this file, audit log, owner copy with read-aloud, fairness page, lender settings that change verdicts, credit-memo copy, shadow-mode report (seeded simulation), investor verification, listings, caps, commitments, allocator and portfolio feed.
- **Stubs (labelled planned):** field visit checklist, counterparty confirmation.
- **Planned on /evaluation:** measured Bangla reading accuracy on labelled real bills, AI cross-check accuracy, Ask-this-file groundedness, check-in extraction accuracy, the Berka real-outcome check (level 2), a real lender shadow trial (level 3) and a human usability check.

## Honest evaluation summary

`npm run eval` writes `ml/model/eval.json`. Each number shows its evidence level, sample size and limitation. On our own synthetic cohort, the gradient-boosting model does **not** beat the logistic baseline or the transparent rules on Brier score (AUC about 0.60 against 0.61 and 0.60), and conformal coverage over-shoots its target (97% against 90%). Both are shown as below their pass marks, which were fixed before the first run (`ml/passmarks.json`). The model can therefore only make a file more cautious; the rules stay primary. The watchman has a median lead time of 3 months and 0.38 false alarms per seasonal borrower-year, against 1.72 for a fixed 30% threshold. None of this is real-world accuracy.

## External contributions

- **AI models:** Claude (Anthropic, `claude-opus-5-5` by default) through the official `@anthropic-ai/sdk`; optionally Gemini through its REST API. Used to read bills and notes, cross-check documents, phrase the file, answer questions about a file and read check-ins. Inputs are redacted first, outputs are validated with Zod and our number, citation and forbidden-word validator, and every call is logged.
- **Libraries:** Express, Mongoose, Zod, Papa Parse, bcryptjs, jsonwebtoken, multer, cookie-parser, cors, dotenv; React, React Router, Vite, Tailwind CSS, Framer Motion; Vitest, tsx, TypeScript; scikit-learn, NumPy, pandas.
- **Fonts** (SIL Open Font License, bundled through Fontsource): Noto Serif Bengali, Noto Sans Bengali, Fraunces, Inter, JetBrains Mono.
- **Data:** all shops, statements, bills, notes, investors, outcomes and the 3,000-shop training cohort are synthetic, generated by scripts in this repository with fixed seeds. In the demo, counterparty types (customer, supplier, personal, utility) are seeded; real statements would need classification with officer correction. Background figures in the pitch come from public news sources listed in `BRIEF.md`: Financial Express, Ittefaq, MicroSave, Justice Corner, TBS, Business Insider BD, Mutual Trust Bank and bKash. The research references are arXiv 1707.00757, the CTU PKDD'99 Financial dataset page (not used yet) and the KhatianDoc benchmark summary.

## Layout

```
client/   React + Vite + Tailwind (all screens)
server/   Express + Mongoose API; src/lib = pure logic (parsing, checks, features, rules, forecast, redaction, validator, model)
ml/       train.py (scikit-learn), passmarks.json, model/ (exported model + eval.json)
BRIEF.md  the build brief · DECISIONS.md  choices the brief left open
```

## Deployment (not done yet)

Client: a static Vite build on Vercel (`client/vercel.json` rewrites routes to `index.html`), with `VITE_API_URL` set to the API. Server: a long-running host such as Render, Railway or Fly, using MongoDB Atlas. For cross-site cookies set `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true` and `CORS_ORIGIN`; the client also sends a bearer token, so login works either way. Free tiers sleep, and the client sends a warm-up request on load.
