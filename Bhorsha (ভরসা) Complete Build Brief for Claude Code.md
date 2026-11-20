# Bhorsha (ভরসা): Complete Build Brief for Claude Code

*One standalone document: the idea, the story, the AI design, the evaluation plan, the build instructions and the interface brief. Written 20 Nov 2026. Replaces every earlier Tikbe document. Everything runs on clearly labelled synthetic data, locally first.*

## How to use this

1. Create an empty folder and a Git repository, then start Claude Code in it.
2. Export this document as Markdown, save it as `BRIEF.md` in the repository, or paste it in whole.
3. Tell Claude Code: **Read BRIEF.md in full, then build it stage by stage, following section 13. Run it locally after each stage and tell me what to check in the browser. Do not deploy anything.**
4. After each stage, run `npm run dev`, click through the new part, and fix problems before moving on.
5. When you are fully satisfied locally, ask Claude Code to do the last stage, deployment.

The next section holds the kickoff prompt to paste. Sections 1 to 14 and 17 are written to Claude Code. Section 15 is the pitch kit for the team and is not a build instruction.

## Deadline and kickoff (read this first)

**The submission cutoff is 11:59pm on Friday 20 November 2026, Dhaka time.** The build must be running and demo-ready well before that. Speed and a working demo path matter more than completeness. If time runs short, follow the cut order below. Do not stall on questions: pick the sensible option, note it in `DECISIONS.md`, and keep going.

### Paste this to Claude Code to start

```text
Read BRIEF.md in full before writing any code. Build the Bhorsha prototype it describes, stage by stage, following section 13 and the cut order in the "Deadline and kickoff" section.

Working rules:
- Run everything locally first (MERN, MongoDB on localhost). Do not deploy anything until I say so.
- After each stage: run the build and the tests, start the app, and tell me in 3 lines what to click to check it. Then continue to the next stage without waiting, unless something is broken.
- Do not ask me questions unless you are completely blocked. For any choice the brief leaves open, pick the simplest option, and add one line to DECISIONS.md.
- Never put a secret in code. Use .env, and provide .env.example.
- The app must work with no AI key (labelled DEMO FALLBACK) and with no trained model (rules fallback).
- Every page shows the synthetic-data ribbon. Investor pages also show the SIMULATION banner. Never use the words certificate, guarantee, ensured or secured.
- Commit after every stage with a clear message.
- Protect the demo path in section 14. If a feature threatens it, cut the feature.

Start with Stage 0.
```

### Cut order if time runs short

Cut from the bottom up. Items above the line are never cut.

| Priority | What | Rule |
| --- | --- | --- |
| Never cut | Stages 0 to 4: scaffold, data and parsing, rules and the viability file, decision record, watchman with **Simulate next month**, watchlist | This is the demo spine |
| Never cut | Synthetic ribbon, proof labels, the six demo shops, seeded data, **Reset demo data** | Honesty and a demo that never opens empty |
| Cut last | Stage 5: AI reading of bills and notes with officer confirmation, cross-checking, phrasing with validator, fallback, audit log | This is the visible AI |
| Cut third | Stage 7: investor simulation (verify, listings, commit with caps, portfolio feed, structure page) | Keep a minimal portfolio feed showing the pharmacy update if possible |
| Cut second | Stage 8: full animation pass, owner copy read-aloud, fairness page, Ask this file, tamper scoring beyond the basic checks | Keep the proof ribbon, coverage ring and runway chart |
| Cut first | Stage 6: trained model, conformal sets, counterfactual search, evaluation page | If cut, the rules verdict stays, and the evaluation page lists these as **planned** |

### Time boxes (Dhaka time, Friday 20 Nov)

- By 3am: Stages 0 to 2 working locally.
- By 9am (after sleep): Stages 3 and 4 working.
- By 1pm: Stage 5 working with a real AI key.
- By 6pm: the demo path in section 14 runs cleanly, locally.
- 6pm to 8pm: deploy (Stage 10), then open the public link in a private window and run the demo path. Record the video with the real key.
- By 8pm: ready to submit. The hours until 11:59pm are buffer only.

If the Vercel link is mandatory, deploy a first version early (even by 3pm) so hosting problems appear while there is still time.

---

## 0. Name, tagline and one-line idea

- **Name:** Bhorsha (ভরসা), meaning something you can rely on. Keep the name and both taglines in one config file.
- **English tagline (v2):** Read the trail. Build the trust.
- **Bangla tagline (v2):** হিসাব পড়ে, ভরসা গড়ে।
- **One line:** Small businesses and small investors both lack a trustworthy view of each other. Bhorsha provides that view, and licensed partners move the money.

## 1. What you are building

**Bhorsha** is a two-sided web platform for small-business finance in Bangladesh, with a **licensed partner** (a bank, finance company or microfinance institution) in the middle.

- **Small businesses** submit the records they already have: mobile-money statements, bill photos and a Bangla note.
- **AI** reads and cross-checks the evidence and produces a one-page **viability file**: a verdict (viable, not sure, not viable), the likely cause, a clear split between what is **checked** and what is only **owner says**, three plain-word reasons, a recovery plan and conditions for approval.
- **The lender's manager** always decides. After a loan, a **watchman** forecasts each shop's expected sales and warns the manager when a shop falls below it.
- **Small investors** (simulated in this build) see the same evidence in plain language, back approved cases through the licensed partner, and follow their loans live.

**The money structure (must be shown in the app).** The licensed partner is the lender of record and holds the money. Bhorsha never holds, receives or pays out funds. It supplies evidence, the viability file, verification workflow and servicing information. Money flows investor, then the partner's pooled facility, then the business, and repayments return along the same path.

**Goal of this build:** a working, polished, AI-heavy, production-shaped prototype for an AI competition submission, on **synthetic data only**. It should feel like a product a lender could trial, without claiming it has been trialled.

## 2. Hard rules (never break these)

1. **Honesty.** Every page shows a persistent ribbon: **SYNTHETIC DEMO DATA. Not real borrowers, not a real lending decision.** Anything involving investors, money or messages is also labelled **SIMULATION**. Never present results as real accuracy.
2. **Human decides.** There is no auto-approve. Every file ends in a manager decision with a recorded reason.
3. **No protected attributes.** Never collect, store, display or infer gender, religion, marital status, ethnicity or proxies. Do not use district as a model feature. Names appear only as labels.
4. **Never use the words certificate, guarantee, ensured, secured or approved by AI.** Say viability file, likely to last, evidence, conditions. Never promise returns.
5. **AI never decides.** AI reads, cross-checks, predicts with stated uncertainty, forecasts, explains and allocates simulated amounts. The transparent rules stay in place as a baseline and a fallback.
6. **No invented numbers.** Text written by an AI may contain only numbers supplied by code.
7. **Secrets.** All keys live in environment variables in a git-ignored `.env`. Never put a key in code or in any committed file.
8. **Redact before AI.** Before anything goes to a model, replace phone numbers, national ID numbers and personal names with tokens.
9. **No real identity data.** The investor verification is a simulation using dummy values.
10. **Document external contributions.** `README.md` lists the AI models, libraries, fonts, datasets and data sources, states that all data is synthetic or public, and explains how to run the project.

## 3. Stack and local setup

The app is a **MERN** project: MongoDB, Express, React and Node. It must **run fully on the local machine first**. Deployment comes last and only when the user says the app is satisfying.

| Layer | Choice |
| --- | --- |
| Structure | One repository with npm workspaces: `client/` and `server/`, plus an `ml/` folder for offline training and evaluation scripts. One root command, `npm run dev`, starts client and server. |
| Frontend | React with Vite, TypeScript, Tailwind CSS and React Router |
| Backend | Node.js with Express, TypeScript |
| Database | MongoDB with Mongoose. The connection string comes from `MONGODB_URI` in `.env`. It must work with a local `mongod` or a free Atlas cluster without code changes. |
| Validation | Zod on every API input and every AI response |
| CSV parsing | Papa Parse on the server |
| ML | Python scripts in `ml/` (scikit-learn, with a gradient-boosting library and a conformal calibration step) that train on the synthetic cohort, export the model to ONNX, and write metrics JSON. Express loads the model with onnxruntime-node. If that proves difficult, run a small local Python service that Express calls. The app must never fail if the model is missing: it falls back to the rules. |
| Forecasting | Seasonal exponential smoothing or seasonal-naive with empirical quantiles, in TypeScript on the server |
| Charts | Hand-built SVG, or Recharts if needed. Keep the bundle light. |
| Animation | Framer Motion, respecting prefers-reduced-motion |
| Login | JWT in an httpOnly cookie with bcrypt. Seeded demo accounts for manager, officer and investor. Demo passwords are shown on the login page. |
| AI | Gemini or Claude SDK, called only from Express routes. Model name and key come from `.env`. |
| Files | Resize bill photos in the browser to about 1600 px on the long edge before upload. The server receives them with multer in memory and does not store them. |
| i18n | A dictionary with a Bangla and English toggle, remembered in local storage. Default to Bangla. |
| Tests | Vitest for parsing, checks, rules, redaction, validators and forecasting |

**Local-first rules**

- The whole app starts with: `npm install`, copy `.env.example` to `.env`, `npm run seed`, `npm run dev`. The client runs at `http://localhost:5173` and the API at `http://localhost:4000`. The Vite dev server proxies `/api` to the API, so there are no CORS problems locally.
- It must work with **no AI key**: a labelled fallback takes over. It must also work with a plain local MongoDB.
- Provide `.env.example` listing every variable with no real values.
- Read the API base URL, port, CORS origin and cookie settings from environment variables. Do not hard-code localhost anywhere deployment would break.
- Do not rely on a scheduler for the watchman. Provide a **Simulate next month** button that runs it on demand.
- A fresh start must never open empty: `npm run seed` fills the database, and a manager-only **Reset demo data** button re-seeds it.
- Add `/api/health`, which checks the database and the model file and returns the app version.
- `npm run build`, `npm test`, `npm run train` and `npm run eval` must work.

**Deployment later (the last stage, do not start until told)**

- **Client:** a static Vite build on Vercel, with a rewrite so every route returns `index.html`, and the API address set through `VITE_API_URL`.
- **Server:** Express is a long-running server, so host it on Render, Railway or Fly. The database moves to MongoDB Atlas.
- **Cross-site cookies:** if client and API are on different domains, cookies need `SameSite=None; Secure`, or switch to bearer tokens. Set `CORS_ORIGIN` to the client's address.
- **Cold starts:** free server tiers can sleep, so the first request can be slow. Add a warm-up request and tell the user to open the link just before submitting or recording.
- **Check:** open the public link in a private window, logged out, and run the full demo path.

## 4. Data model (Mongoose)

Each bullet is a collection. Use ObjectId references for links, add timestamps and index the fields you query.

- `users`: role (manager, officer or investor), display\_name, email, password\_hash.
- `shops`: label, business\_type, months\_trading, owner\_label, token (random, for the owner copy), cohort\_flag (demo or synthetic\_cohort).
- `applications`: shop, loan\_ask\_bdt, tenor\_months, purpose, status (draft, filed, decided, funded), created\_at.
- `transactions`: shop, date, amount\_bdt, direction, counterparty\_kind (customer, supplier, personal, utility, other), balance\_after\_bdt, note.
- `documents`: shop, kind (bill, note, visit\_photo), extracted\_json, field\_confidences, officer\_confirmed, confirmed\_at.
- `evidence_items`: application, claim\_key, claim\_text, value, label (checked or owner\_says), source\_kind, source\_ref.
- `findings`: application, kind (contradiction, tamper, coverage), text, cited\_evidence\_ids, severity.
- `verdicts`: application, rules\_verdict, rules\_points\_json, model\_probability, conformal\_set, final\_verdict, band\_low, band\_high, coverage\_pct, cause, reasons\_json, recovery\_plan\_json, conditions\_json, counterfactuals\_json, text\_bn, text\_en, generated\_by (rules, model\_hybrid, ai\_phrased or template), disagreement\_flag.
- `decisions`: application, manager, decision (approve, ask\_more, decline), reason, overrode\_verdict, created\_at.
- `check_ins`: shop, month, reported\_sales\_bdt, problem\_note, source.
- `forecasts`: shop, month, expected\_low, expected\_mid, expected\_high, actual, flagged.
- `flags`: shop, month, severity, probable\_cause, suggested\_action, status.
- `interventions`: flag, officer, action, result\_note.
- `outcomes`: application, checkpoint\_months (3, 6, 12), trading, note.
- `investors`: user, verification\_status, cap\_per\_loan\_bdt, cap\_total\_bdt.
- `investor_verifications`: investor, step, status, simulated\_at.
- `commitments`: investor, application, amount\_bdt, status.
- `investor_updates`: application, source\_flag, plain\_text\_bn, plain\_text\_en.
- `audit_log`: actor, action, redacted\_payload\_json, created\_at. Log every AI and model call with redacted input and returned output.
- `lender_settings`: min\_coverage\_pct, max\_installment\_to\_margin, required\_documents\_json, language\_default, refinance\_toggle, investor caps.
- `eval_runs`: component, level, metric\_name, value, ci\_low, ci\_high, sample\_size, limitation, run\_at.

## 5. Features to build

Priority: **Must** is needed for the submission, **Should** if time allows, **Stub** is a labelled screen with seeded data, marked planned.

### Evidence

| Id | Feature | Priority | Acceptance check |
| --- | --- | --- | --- |
| A1 | Consent and intake wizard: consent, statement upload, bill photo upload, Bangla note, owner-stated cash share | Must | Cannot proceed without consent |
| A2 | Statement parsing: monthly inflow, outflow, regularity, gaps | Must | Works on seed CSVs, unit tested |
| A3 | Bill and note reading by AI, officer confirms each field | Must | Fields stay unconfirmed until ticked; fallback labelled |
| G1 | Consistency and tamper checks: balance continuity, duplicates, round-number runs, total mismatch, statistical and anomaly score | Must | Flags the tampered seed statement; wording is checked for consistency, never verified authentic |
| G2 | Coverage meter and seasonal baseline | Must | Coverage ring; the band widens when coverage is under 50% or history under 12 months |
| E2 | Field visit checklist | Stub | A screen showing the flow, marked planned |
| E3 | Counterparty confirmation | Stub | A screen showing the flow, marked planned |

### Judgment

| Id | Feature | Priority | Acceptance check |
| --- | --- | --- | --- |
| B1 | Proof labels: every claim tagged checked or owner says | Must | No claim appears without a label |
| B2 | Viability file: one page, Bangla and English, verdict, band, cause, three reasons, recovery plan, watch list, box titled what this cannot tell you | Must | Prints cleanly to one A4 page |
| B3 | Refinance fit check: CIB status declared, grace period fit, 9% cap, working-capital purpose | Should | Pass, fail or unknown per rule |
| E4 | Conditional approval and staged release from counterfactual conditions | Must | Conditions listed, with a suggested tranche plan |
| B4 | Rules vs model disagreement notice | Must | When rules and model differ, the manager sees it and why |

### Decision and follow-up

| Id | Feature | Priority | Acceptance check |
| --- | --- | --- | --- |
| C1 | Manager decision record, reason mandatory when overriding | Must | Saved and visible in the audit view |
| C2 | Watchman with forecast intervals and monthly check-ins | Must | Simulate next month flags the pharmacy and does not false-alarm the fish trader |
| E5 | Branch watchlist: ranked weekly list of borrowers to call, with reasons | Must | Ranked by severity and recency |
| E6 | Intervention log | Should | Visible under each flag |
| C3 | Outcome capture at 3, 6 and 12 months | Should | A small form feeding the evaluation |

### Trust and fit

| Id | Feature | Priority | Acceptance check |
| --- | --- | --- | --- |
| E1 | Shadow-mode report: Bhorsha verdict vs manager decision vs outcome, with survival by band | Stub | Seeded, labelled **SIMULATION, illustrative only** |
| D1 | Owner copy: plain Bangla page via a private token, with a read-aloud button using the browser speech API | Should | No login; no internal scoring detail |
| D2 | Fairness and audit page: inputs used, no-protected-attributes statement, audit log, group comparison on the synthetic cohort | Should | Lists every AI call with redacted input |
| D3 | Lender settings that really change the verdict | Stub | Editable thresholds take effect |
| G3 | Export to the lender's credit memo format | Should | Print stylesheet or copy-as-text block with memo headings |

The investor module is in section 10, the AI components in section 7, and the evaluation in section 9.

## 6. Verdict logic: model, uncertainty and rules together

**Flow.** Features go to the calibrated classifier, which gives a probability of still trading at 12 months. A conformal step turns it into a prediction set: only viable, only not viable, or both. Both is shown as **not sure**. The rules produce the readable reasons and run as a baseline. If the model file is missing, the rules produce the verdict. If rules and model disagree, show the disagreement notice to the manager.

**Model features** (all derived from transactions, documents and stated inputs): estimated coverage, log monthly visible inflow, 3-month and 6-month trend, seasonal-adjusted deviation, coefficient of variation, supplier on-time share and lateness trend, household-mixing share, receivable days, installment-to-margin, months of history, count of consistency flags, balance volatility and customer concentration. **Excluded:** district, owner name, and any protected attribute or proxy. Business type is used only for seasonality.

**Likelihood band.** From the calibrated probability and the conformal calibration. Widen it when coverage is under 50% or history under 12 months.

**Cause.** The largest negative contributor among stock problem, fewer customers, higher costs, buyers paying late, and household money mixed in.

**Conditions (E4).** The smallest realistic changes that would move the verdict, found by a constrained search over actionable features (for example lower household transfers, clear supplier arrears, collect a named receivable, supply 12 months of history). Never suggest changing an unchangeable or protected feature. Suggest releasing the loan in two or three parts tied to the conditions.

### Rule baseline (transparent, tunable in settings)

These are illustrative defaults. Show every rule's contribution as a reason.

| Rule | Condition | Points |
| --- | --- | --- |
| Trend | rising over 6 months | +1 |
| Trend | down more than 15% over 3 months, season adjusted | -2 |
| Supplier regularity | 90% or more paid on time | +1 |
| Supplier regularity | lateness rising | -1 |
| Household mixing | over 25% of outflows | -2 |
| Debt service | installment to margin under 0.35 | +1 |
| Debt service | installment to margin over 0.5 | -2 |
| Receivable | over 60 days and unconfirmed | -1 |
| History | under 6 months | -1 |
| Consistency | any high-severity check failed | -2 |

The installment is computed from the loan ask, a 9% rate and the tenor. Margin is the owner-stated margin, default 15% of estimated turnover, where estimated turnover is visible inflow divided by (1 minus the stated cash share). Total of +3 or more is viable, between -2 and +2 is not sure, and -3 or less is not viable.

## 7. AI components and integration

The product is **AI-heavy by design** and every component is **measurable**. Pipeline: perceive, reason, predict, forecast, explain, allocate, learn.

| # | Component | What it does | Technique | Metric | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | Bangla document and note understanding | Reads bill photos and typed or handwritten Bangla notes into structured fields, each with a confidence. Low-confidence fields go to the officer. | Multimodal LLM with a schema, retry and validation | Field-level F1, amount exact match, character error rate, accuracy-vs-coverage curve | **Must** |
| 2 | Cross-document reasoning | Compares the owner's claims, bills and statement and lists contradictions. Each finding cites the evidence items it comes from. | LLM over structured facts, with a validator that rejects unknown evidence ids | Recall of seeded contradictions, false findings, citation validity | **Must** |
| 3 | Viability classifier | Probability of still trading at 12 months, with the features that moved it | Logistic baseline and gradient boosting with isotonic or Platt calibration, trained offline | AUC with CI, PR-AUC, Brier score, calibration curve, rules vs model vs hybrid | **Must** |
| 4 | Conformal not sure | The verdict is the conformal set; not sure means both outcomes are in the set | Split conformal prediction on a held-out calibration set | Empirical coverage, share of not sure, accuracy of confident verdicts | **Must** |
| 5 | Seasonal forecasting watchman | Forecasts expected monthly inflow with an interval from the shop's own history and flags months below it | Seasonal exponential smoothing or seasonal-naive with empirical quantiles | Lead time, false alarms per borrower-year, precision at k, against a fixed-threshold baseline | **Must** |
| 6 | Counterfactual conditions | The smallest realistic changes that would move the verdict | Constrained search over actionable features | Validity, features changed, plausibility | **Should** |
| 7 | Tamper and anomaly detection | Flags edited or odd statements | Statistical tests on balances and digits, plus an isolation-forest score | Detection rate by tamper strength, false positives on clean files | **Should** |
| 8 | Ask this file | Questions in Bangla or English answered only from the case's evidence, with citations; declines anything else | Retrieval over the evidence items plus an LLM, with a check that cited ids exist | Citation validity, groundedness, correct refusals | **Should** |
| 9 | Check-in extraction | The owner types or speaks a monthly update in Bangla; AI extracts sales and problems | Browser speech or typed text, then LLM extraction | Extraction accuracy | **Should** |
| 10 | Investor pool allocator | Proposes a spread across approved cases limiting concentration and expected loss under the bands | Constrained optimisation | Concentration, expected loss in simulation, cap compliance | **Should** (simulation only) |
| 11 | Similar-case retrieval and intervention suggestions | For a flagged case, the most similar past synthetic cases, what was tried and what happened | Nearest neighbours on case features or embeddings | Retrieval quality on seeded pairs | **Finals** |

Build components 1, 2 and 5 first, because they carry the demo. Then 3 and 4, then 6, 7 and 9, then 8 and 10. Component 11 is for the finals. Anything not finished must appear on `/evaluation` as **planned**, never as done.

### Integration spec

1. **Redact.** Replace Bangladeshi mobile numbers (01 followed by 9 digits, also +880), long digit runs that look like ID numbers, and personal names with tokens such as PERSON\_1.
2. **Bill reading.** Send the resized image to a multimodal model with an instruction to return only fields that are visible, null for anything unreadable, never guessing. Required fields: document type, supplier label, date, amount in BDT, due date, paid date if shown, language, a confidence from 0 to 1, and fields needing review. Normalise Bangla numerals to digits. Validate against a Zod schema, retry once, then fall back.
3. **Note reading.** Return stated cash share, whether the business is seasonal, receivables owed with days, concerns raised, and the language. Same rules.
4. **Officer confirmation.** Show every extracted field beside the image and require a tick. Unticked fields do not count. Ticked fields from a document become checked; claims taken only from the owner's note become owner says.
5. **Cross-document reasoning.** Give the model the structured facts, each with an id. Require findings that cite ids. Reject any finding that cites an unknown id.
6. **Phrasing the file.** Give the model only a facts object: verdict, band, cause, rule contributions, counterfactual conditions, recovery goals and every allowed number with an id. Ask for Bangla and English text with three reasons, each citing fact ids. **Validator:** every number in the output must be in the allowed numbers, every reason must cite known ids, and no forbidden words from rule 4. If it fails twice, use a deterministic template and set `generated_by` to template.
7. **Fallback.** If an AI call fails or no key is set, use canned outputs for the seed documents, tagged **DEMO FALLBACK** on screen. The app must never break.
8. **Audit.** Write every call, with its redacted input and the output, to `audit_log`.

## 8. Synthetic data and seeds

### The demo shops (fictional)

Generate twelve months of transactions per shop with fixed random seeds. Amounts in BDT.

| Shop | Type | Loan ask | Pattern to generate | Expected result |
| --- | --- | --- | --- | --- |
| Rahima Tea and Grocery | Tea stall and grocery | 200,000 | About 38,000 a month visible inflow, rising about 2% a month, owner states 60% cash, regular supplier bills, lumpy purchases with mid-month stock-outs | Viable, moderate band, cause stock problem |
| Sultana Knitwear | Sweater unit, 4 machines, 18 workers | 1,200,000 | About 240,000 a month, lumpy by order, one buyer owes 400,000 for 75 days | Viable with conditions and a tranche plan tied to collecting the receivable |
| Karim Pharmacy | Pharmacy | 500,000 | About 160,000 a month, falling about 20% over the last 3 months, supplier payments getting later | Not sure at filing; the watchman flags a dip after funding |
| Nasir Mobile Accessories | Accessories shop | 300,000 | About 90,000 a month, 35% of outflows to personal contacts | Not sure, cause household money mixed in |
| Jahan Fish Trader | Seasonal trader | 400,000 | Monthly inflow swings about fourfold by season, with a note saying seasonal | Viable with a wider band; no false alarm in lean months |
| Tania Online Clothing | Online clothing seller | 600,000 | Strong last 3 months, 6 months of history, a festival-sale spike, a statement whose running balance does not reconcile | Consistency check fails, not sure, asks for 12 months |

Provide a generated bill image and a Bangla note for at least two shops, as simple placeholders with plausible Bangla text, so reading has something to read. Seed the manager, officer and investor accounts, five investors with small commitments (Karim Pharmacy carrying at least two), and historical decisions and outcomes for the shadow report. Seed month-by-month check-ins after funding so **Simulate next month** steps through them.

### The synthetic cohort for training and evaluation

A separate generator script produces about 3,000 shops over 12 to 18 months. Use latent states (healthy, stock problem, late payers, household mixing, seasonal, declining), a hidden hazard model for closure, label noise, overlapping archetypes, missing months, and a variable cash share. **Freeze the generator before training.** Hold out some archetype mixes and noise levels for testing. Generate a protected attribute independent of outcomes for the fairness test. Flag these shops `synthetic_cohort` so they never appear in the demo lists.

## 9. Evaluation plan

The aim is an evaluation a sceptical judge or lender would accept. The main danger is **circularity**: a model trained and tested on data our own scripts generated will look excellent and prove very little.

### Principles

1. **Freeze before you train.** Fix the generator, the splits and the pass marks before the first model run. Do not tune the generator until results look good.
2. **Split by shop and by time.** Train on earlier months and test on later ones. A shop appears in only one split. Use only data before the loan date when predicting an outcome.
3. **Report uncertainty.** Give sample sizes and bootstrap confidence intervals, with fixed seeds, so `npm run eval` reproduces every number.
4. **Compare with baselines.** Show each AI component against a simpler alternative: a fixed threshold, the plain rules, a logistic model or a naive forecast.
5. **Run ablations.** Without seasonal adjustment, without cross-document reasoning, without the model.
6. **Treat a very high score as a warning.** Published work on a French bank's corporate account data reports test AUCs of about 0.76 to 0.84, with boosting overfitting and performance dropping under time shift ([arXiv 1707.00757](https://arxiv.org/pdf/1707.00757)). An AUC near 0.95 on our own data suggests leakage or an easy generator.

### The four-level evidence ladder

| Level | What it shows | Data | Claim it supports |
| --- | --- | --- | --- |
| 0. Correctness | The code does what the design says | Unit tests | The system works as specified |
| 1. Synthetic cohort, held-out settings | Robustness under change | About 3,000 generated shops with noise and label noise; test on mixes and noise levels not used in training | The pipeline runs end to end and is robust. **Not** real-world accuracy. |
| 2. Real outcomes, different setting | The transaction-to-outcome step on real labels | The PKDD'99 Financial (Berka) dataset: 682 loans, 606 successful and 76 not, with account transactions, public through the CTU repository ([CTU](https://relational.fel.cvut.cz/dataset/Financial)). A Czech bank, late 1990s. | The method finds signal in real repayment outcomes. **Not** that it works for Bangladeshi shops. |
| 3. Real lender, shadow mode | Agreement and survival by band in practice | A real lender's files | A first real-world accuracy estimate. **Planned, not done.** |

Berka has few bad loans (76), so use stratified cross-validation, report PR-AUC as well as AUC, give confidence intervals, and respect the loan date because the repository warns about leakage. I found no licence statement on its page, so cite the source and check its terms.

### Metrics and suggested pass marks

The pass marks are our own suggestions and must be fixed **before** the first run. They are not standards.

| Component | Metrics | Suggested pass mark |
| --- | --- | --- |
| 1. Document understanding | Field-level F1, amount exact match, character error rate, accuracy vs coverage. Report **printed and handwritten separately.** | Printed bills F1 at least 0.85. Handwritten reported, not targeted. |
| 2. Cross-document reasoning | Recall of seeded contradictions, false findings, citation validity | Recall at least 0.80, false findings at most 5%, citation validity 100% |
| 3. Classifier | AUC with CI, PR-AUC, Brier score, calibration slope and curve, share of good firms approved at a fixed bad-loan rate, top-decile capture | Beats the logistic baseline and the rules on Brier score, with the CI reported |
| 4. Conformal not sure | Empirical coverage, share of not sure, accuracy of confident verdicts | Coverage within 3 points of target |
| 5. Watchman | Median lead time, false alarms per borrower-year on seasonal shops, precision at k | Median lead time at least 2 months, fewer false alarms than the fixed threshold |
| 6. Counterfactuals | Validity, features changed, plausibility | At least 90% valid, no change to a protected or unchangeable feature |
| 7. Tamper detection | Detection rate by tamper strength, false positives on clean files | Report the full curve, no single headline number |
| 8. Ask this file | Citation validity, groundedness, correct refusals | Citation validity 100% on answers given |
| 10. Pool allocator | Concentration, simulated expected loss, cap compliance | Cap compliance 100%, lower concentration than a naive split |
| All | Latency, cost per file, fallback rate | Reported |

### Evidence from outside our own generator

- **Real documents.** Collect 20 to 30 real, non-sensitive bills or receipts from local shops, with permission and no personal data, and label them by hand. Use them as a small sanity check for component 1, kept apart from the synthetic documents.
- **Bangla reading is hard.** A 2026 benchmark of Bengali land records found six multimodal LLMs scored very poorly on handwritten symbols (character error rates of 77% to 97%) and on extraction, although those were specialised handwritten records and not shop bills ([KhatianDoc summary](https://www.alphaxiv.org/abs/2609.03597.md)). Report handwritten separately, keep the officer confirmation, and never present extraction as solved.
- **Human check.** Ask 3 to 5 people to rate a sample of generated files for clarity and usefulness in Bangla. Report it as a small usability check, not accuracy.

### Fairness checks

Show the list of inputs and confirm no protected attribute is among them. In the synthetic cohort, run one scenario where a generated protected attribute is independent of outcomes and another where it is correlated with a proxy such as location. Report approval-rate gaps and equal-opportunity differences, and show that dropping the attribute does not remove a proxy effect.

### What the evaluation cannot show

That Bhorsha works on real Bangladeshi shops, that the investor side attracts investors or performs, or that extraction is reliable on real handwritten documents. State these on the `/evaluation` page next to the numbers.

### Reporting

`npm run eval` runs every component on its test set and writes one JSON file, and `/evaluation` renders it as tables and small charts. Each result shows its level on the ladder, its sample size and its limitation. Do not show a number without those three.

## 10. Investor side (simulation module)

**Everything here is a simulation. There is no real money, no real investor and no real loan.** Show **SIMULATION: no real money, no real investors** on every investor page, as well as the synthetic ribbon.

**Rules**

- The licensed partner (a fictional one, labelled *Licensed partner, simulated*) holds the money. Bhorsha never does.
- Verification is a simulated wizard (identity check, source-of-funds declaration, risk acknowledgement) using dummy values. Collect no real identity document or number.
- Per-investor caps apply to each loan and in total.
- Only cases with a viable verdict **and** an approve decision can be listed.
- Investors see a plain-language version of the file with the same proof labels and conditions. Owner-identifying details are hidden.
- Never show a projected return. Show the simulated pool's history, clearly labelled. Every page states that investors can lose money.

**Screens:** `/invest/verify`, `/invest` (listings with shop type, loan size, amount open, verdict, proof-ribbon share, runway line), `/invest/[caseId]` (investor-facing file and a commit control respecting caps), `/portfolio` (holdings, spread across loans, live updates), and `/structure` (the money-flow diagram and a checklist titled *What must be true in real life*: an agreement with a licensed lender, regulator approval where required, investor verification and anti-money-laundering controls, investor risk disclosures and a lawyer's review, each shown as **not yet done**).

**Live behaviour.** When **Simulate next month** raises a watchman flag, create a plain-words update for every investor with a commitment in that case. A lean-month dip for the seasonal trader must **not** create an alarming update. Component 10 proposes spreads across cases.

**Acceptance.** Caps are enforced on every commit. An investor cannot commit before verification. Simulate next month produces the pharmacy update in the feed. Every investor page shows both banners. The structure page lists each real-world requirement as not yet done.

## 11. Design brief: a distinctive, calm, premium interface

**Concept.** Bhorsha should feel like a trusted ledger-and-paper workspace crossed with a quiet control room: serious enough for a bank manager, warm enough for a shop owner, and clearly not another purple-gradient AI dashboard. The signature idea is **durability made visible**: a business's evidence is shown as a **runway line** that either holds or dips, and every claim shows how much of it is proven.

**Mood.** Deep, calm and precise. A jute-paper dossier on a dark teal desk. Generous space, strong type, and small moments of motion that explain something.

**Colour tokens** (CSS variables; light and dark through prefers-color-scheme and a manual toggle):

| Token | Dark (control room) | Light (paper) |
| --- | --- | --- |
| Background | #0B1A18 | #F6F1E7 |
| Surface | #12292A | #FFFFFF |
| Raised surface | #183638 | #FBF8F1 |
| Text | #EDE7D9 | #1B2A28 |
| Muted text | #9DB3AE | #5B6F6B |
| Line | #28484A | #E2DACA |
| Accent (jute gold) | #E0B24F | #A8741A |
| Viable | #4FC9A0 | #137A5A |
| Not sure | #F0B34A | #9A6400 |
| Not viable | #F0705A | #B03A25 |
| Checked | #4FC9A0 | #137A5A |
| Owner says | #8FA6C9 | #4A648C |

Never rely on colour alone: every verdict and label also has an icon and a word. Keep text contrast at WCAG AA or better.

**Typography.** Load with Fontsource packages (npm, so they work offline): **Noto Serif Bengali** for Bangla headings, **Noto Sans Bengali** for Bangla body, **Fraunces** (or Newsreader) for English display, **Inter** for English interface text, and **JetBrains Mono** for figures with tabular numerals. Give Bangla a slightly larger size and 1.7 line height. Offer a Bangla or Latin numerals setting.

**Signature components**

1. **Proof ribbon.** Beside every claim, a short segmented bar: solid for checked, hatched for owner says, with the label in words. A file-level summary shows the share checked.
2. **Coverage ring.** A thin ring showing how much of turnover the evidence can see, with the number in the centre and a plain sentence under it.
3. **Runway chart.** A smooth SVG line of monthly visible inflow with a soft forecast band. It draws left to right. On the watchman page, a dip crosses the band and the point pulses once.
4. **Verdict tag.** Not a certificate: a calm rounded tag with an icon and the verdict word, plus the likelihood band as a range bar. Beside it, always show: *Advice for the manager. The decision is yours.*
5. **Viability file page.** A single sheet of paper on the dark desk: serif headings, thin rules, a margin column for proof labels, and a boxed section titled *What this cannot tell you*. It prints to one A4 page.
6. **Heartbeat rows.** In the watchlist, each borrower is a row with a tiny sparkline. A flagged borrower's line gets a faint amber pulse and a reason chip.
7. **Evaluation cards.** On `/evaluation`, each metric is a card showing the value, its confidence interval, the sample size, its level on the evidence ladder and a one-line limitation.

**Motion** (Framer Motion; simplify under prefers-reduced-motion)

- Landing hero: the Bangla tagline over a runway line that draws, wobbles and holds, above a very slow paper-grain background.
- Intake: uploaded documents slide into a stack as cards, then each extracted field appears with a small stagger.
- Viability file: sections assemble in sequence and proof ribbons fill in. Keep it under 1.2 seconds.
- Page transitions: short fades with a slight upward move. Never loop heavy animation.

**Layout.** Dashboard with a left navigation rail, a top strip (language toggle, theme toggle, role badge), a case pipeline, a watchlist card and a shadow-mode card. The intake wizard has four steps, large touch targets and a mobile-first layout. The case page shows the paper file on the left and evidence, checks, conditions, the decision panel and the audit trail on the right. The owner copy is one narrow, warm, large-type Bangla page. Investor pages use the same tokens with a warmer, simpler tone.

**Details.** Useful empty states, skeleton loaders shaped like the file, realistic Bangla copy, a first-run tour of three tooltips (proof ribbon, verdict tag, Simulate next month), keyboard navigation with visible focus rings, aria labels, and a light first load.

**Avoid:** purple or blue gradients, glassmorphism everywhere, generic stock illustrations, robot or brain icons, and the phrase AI-powered in headlines. Avoid gambling or trading imagery and urgency language on investor pages.

## 12. Screens

| Route | Purpose |
| --- | --- |
| `/` | Landing: the runway hero, one-sentence purpose, three things Bhorsha does, an honest limits note, a demo login |
| `/login` | Demo accounts with passwords shown |
| `/dashboard` | Pipeline, watchlist preview, shadow-mode summary |
| `/cases` | All cases with verdict, band and status |
| `/cases/new` | The intake wizard |
| `/cases/[id]` | The viability file, evidence, checks, conditions, decision and audit trail |
| `/watchlist` | Ranked borrowers, flags, intervention log and the Simulate next month button |
| `/shadow` | Shadow-mode report (seeded, labelled simulation) |
| `/owner/[token]` | The owner's plain Bangla copy |
| `/fairness` | Inputs used, the no-protected-attributes statement, group comparison, audit log |
| `/evaluation` | All metrics with their evidence level, sample size and limitation; unfinished components shown as planned |
| `/settings` | Lender settings that change the verdict |
| `/invest/verify`, `/invest`, `/invest/[caseId]`, `/portfolio`, `/structure` | The investor simulation |
| `/about` | What Bhorsha is and is not, the limits, the tools and data sources |

## 13. Build stages

Run locally and check in the browser after each stage. Do not deploy before the last stage.

- **Stage 0: scaffold.** Workspaces, Tailwind, fonts, design tokens, the MongoDB connection, `/api/health`, the synthetic ribbon and login. Confirm `npm run dev` works from a clean clone.
- **Stage 1: data and parsing.** Models, the seed script, statement parsing, consistency checks, coverage, unit tests, and a simple case list.
- **Stage 2: rules and the file.** Rules engine, evidence labels, and the one-page viability file with template text and print styles.
- **Stage 3: decision.** The decision record, audit view, conditions and tranche plan.
- **Stage 4: watchman.** Check-ins, the seasonal forecasting watchman, flags, Simulate next month, the watchlist and the intervention log.
- **Stage 5: AI reading and reasoning.** Redaction, bill and note reading with confirmation, cross-document reasoning, phrasing with the validator, the fallback and audit logging.
- **Stage 6: model and uncertainty.** The cohort generator, training, calibration, conformal sets, counterfactual conditions, the disagreement notice, and the first `npm run eval` with the `/evaluation` page.
- **Stage 7: investor simulation.** Section 10, including the allocator.
- **Stage 8: polish.** The full design pass, animation, the mobile intake layout, the owner copy, the fairness page, tamper scoring and Ask this file.
- **Stage 9: extras.** The shadow-mode report, lender settings, credit-memo export, stub screens and README.
- **Stage 10: deployment.** Only when the user says the local version is satisfying. Follow the deployment notes in section 3.

**Definition of done (before Stage 10).** The app runs locally from a clean clone using the commands in section 3. The full demo path in section 14 works without errors. Tests pass and both workspaces build. `npm run eval` runs and `/evaluation` shows honest numbers with their limits. No secret is in the repository. Every page shows the synthetic ribbon. The README lists tools, data sources and how to run it.

## 14. The demo path the app must support (3 minutes)

1. **Problem (about 20 seconds):** the landing page, then the dashboard.
2. **The file (about 55 seconds):** open Rahima Tea and Grocery. Show the statement and bill, the AI reading with the officer confirming a field, the coverage ring, the proof ribbons, the verdict with its band, the cause, the conditions and the recovery plan.
3. **Manager decides (about 15 seconds):** approve with a condition and a recorded reason.
4. **The moment (about 40 seconds):** open the watchlist, press **Simulate next month**, and watch Karim Pharmacy's line fall below its forecast band with a flag, a probable cause and a suggested action. Then show that Jahan Fish Trader does not false-alarm in a lean month.
5. **Investors (about 15 seconds):** the portfolio feed shows the pharmacy update, labelled simulation.
6. **Trust and evidence (about 20 seconds):** the Tania Online Clothing consistency flag, then the `/evaluation` page.
7. **Limits and next step (about 15 seconds):** the structure page's not-yet-done checklist.

## 15. Pitch kit (for the team, not a build instruction)

**The reframe.** Trust is the missing piece, not money. Small businesses and small investors both lack a trustworthy view of each other. Bhorsha provides it, and licensed partners move the money.

**The story in five beats**

1. **The problem moment.** A viable shop is refused because the bank cannot read its informal records. Banks are wary: classified CMSME loans were 26.04% at end-March 2026 ([Financial Express](https://thefinancialexpress.com.bd/trade/cmsme-asset-quality-worsens-with-26pc-classified-loan-ratio)).
2. **Why now.** Cheap refinance money exists (the Tk 5,000 crore fund, with banks borrowing at 4% and lending at up to 9%, per [Ittefaq](https://en.ittefaq.com.bd/16875/bb-launches-tk-5-000cr-revolving-refinance-fund)), credit bureau reform is coming ([MicroSave](https://www.microsave.net/2025/12/08/bangladeshs-bureau-reform-turns-repayment-history-into-portable-assets/)), and mobile-money records are everywhere.
3. **What Bhorsha does.** It turns what a shop already has into a one-page file that separates proven from owner-says, then watches the loan after it starts.
4. **Who it serves, in order.** Lenders first, because the file helps them decide and recover. Then small investors, who can back viable shops through a licensed partner and see the same evidence and live updates.
5. **How it stays honest.** The partner holds the money, nothing is guaranteed, and every demo screen is labelled synthetic or simulated.

**The staged path.** Gate each stage on evidence.

| Stage | What happens | What must be proven first |
| --- | --- | --- |
| 1 | One lender trials the file in shadow mode, changing no decisions | The file agrees with outcomes |
| 2 | The partner co-funds viable cases with the manager's approval | Stage 1 results hold |
| 3 | Small investors join the partner's pool with caps and verification | A lawyer's sign-off and a partner agreement |

**Wording swaps**

| Instead of | Say |
| --- | --- |
| Investors lend to businesses | Investors fund viable businesses through a licensed partner |
| Secure, safe, ensured | Evidence-checked, with conditions and monitoring |
| AI predicts failure | AI shows what is proven and warns when something slips |
| We will scale across Bangladesh | We start with one lender and one business type |
| Our accuracy is X% | In our synthetic test the method behaved as designed (only if you ran it) |

**Answers to likely judge questions**

| Question | Answer |
| --- | --- |
| Who holds the money? | The licensed partner. We never do. |
| What if it fails? | Investors can lose money. That is why we cap exposure, spread it across loans and watch each one. |
| Is it legal? | Not yet. That is a stage we must earn with a partner and a lawyer. The legal guide we read says a platform involving investment collection or lending needs Bangladesh Bank approval, and describes partnering with a licensed lender as the lawful route ([Justice Corner](https://justicecornerbd.com/blogs/digital-lending-in-bangladesh-a-legal-2026)). It is general information, not legal advice. |
| Is it a safety certificate for the bank? | No. It is decision support for thin-file firms. The manager and the bank's risk team decide and carry the risk. |
| Is it scalable? | Yes, but slowly. The software is cheap to copy. Trust and data access grow one lender and one business type at a time. |
| What is new? | The pieces exist elsewhere. The new part is the evidence-labelled file with principled uncertainty, conditions, a forecasting watchman and the investor view, built for Bangladesh's refinance rules. |
| Why not just credit scoring? | Scoring needs formal data these firms lack. Bhorsha shows its evidence, labels what is unverified, and gives conditions and ongoing warning. |
| How accurate is it? | We can show the method works on synthetic data and a public real-outcome dataset from another country. Real accuracy needs a lender trial, which is the first stage of our path. |

**Honest positioning.** Do not claim accuracy, a score, or that anything is secured, ensured or guaranteed. Say the prototype uses synthetic data. Competing space to be aware of: BRAC Bank and bKash merchant nano loans ([Financial Express](https://thefinancialexpress.com.bd/trade/brac-bank-launches-nano-loans-of-up-to-tk-50000-for-bkash-merchants)), banks already doing cash-flow lending in-house ([Financial Express](https://thefinancialexpress.com.bd/special-issues/shifting-away-from-collateral-based-lending-key-to-cmsme-survival)), and Dana's earlier alternative-scoring pilot ([TBS](https://www.tbsnews.net/feature/panorama/dana-fintech-pioneering-digital-credit-scoring-digital-loans-bangladesh-247174?amp)).

## 16. What to tell the user when you finish

- The exact commands to run it locally, the local addresses and the demo logins.
- Which features are fully working and which are labelled stubs or planned.
- Whether the AI calls ran against a real model or the fallback, and which environment variables must be set.
- What `npm run eval` reports, and which results are still planned.
- Anything you could not verify, such as how Bangla extraction performed on the sample images.

## Sources

- [CMSME asset quality worsens with 26pc classified loan ratio (Financial Express, 8 Aug 2026)](https://thefinancialexpress.com.bd/trade/cmsme-asset-quality-worsens-with-26pc-classified-loan-ratio)
- [BB launches Tk 5,000cr revolving refinance fund for CMSMEs (Ittefaq)](https://en.ittefaq.com.bd/16875/bb-launches-tk-5-000cr-revolving-refinance-fund)
- [BRAC Bank launches nano loans of up to Tk 50,000 for bKash merchants (Financial Express)](https://thefinancialexpress.com.bd/trade/brac-bank-launches-nano-loans-of-up-to-tk-50000-for-bkash-merchants)
- [Shifting away from collateral-based lending key to CMSME survival (Financial Express, 28 Jun 2026)](https://thefinancialexpress.com.bd/special-issues/shifting-away-from-collateral-based-lending-key-to-cmsme-survival)
- [Bangladesh's bureau reform turns repayment history into portable assets (MicroSave)](https://www.microsave.net/2025/12/08/bangladeshs-bureau-reform-turns-repayment-history-into-portable-assets/)
- [Digital lending in Bangladesh: a legal guide (Justice Corner)](https://justicecornerbd.com/blogs/digital-lending-in-bangladesh-a-legal-2026)
- [Signing the maiden Peer Lending Agreement (TBS)](https://www.tbsnews.net/thoughts/signing-maiden-peer-lending-agreement-handshake-million-handshakes-1416311)
- [CMSME credit guarantee extended to working capital (Business Insider BD)](https://www.businessinsiderbd.com/banking-insurance/news/31364/tk-25000cr-cmsme-loan-bb-extends-guarantee-to-working-capital-trade-finance)
- [Basic documents needed to apply for loans (Mutual Trust Bank)](https://www.mutualtrustbank.com/sme/basic-documents-needed-to-apply-for-loans/)
- [bKash e-statement help page](https://www.bkash.com/en/customer-service/category/self-services/e-statement)
- [Dana Fintech: pioneering digital credit scoring (TBS, 2021)](https://www.tbsnews.net/feature/panorama/dana-fintech-pioneering-digital-credit-scoring-digital-loans-bangladesh-247174?amp)
- [Checking account activity and credit default risk of enterprises (arXiv 1707.00757)](https://arxiv.org/pdf/1707.00757)
- [PKDD'99 Financial dataset (CTU Relational Repository)](https://relational.fel.cvut.cz/dataset/Financial)
- [KhatianDoc benchmark summary (alphaXiv)](https://www.alphaxiv.org/abs/2609.03597.md)

## 17. Corner cases the build must handle

These are behaviours to implement and test. They come from the team walkthrough.

**Evidence and documents**

- Under 3 months of statement or none: verdict is **not sure**, wide band, and a list of what to upload. Lender settings set the minimum documents.
- Under 12 months of history: widen the band, deduct one rule point, and state that seasons cannot be judged.
- Low coverage (mostly cash shop): show the low share in the coverage ring and widen the band. Never fill the gap from the owner's word alone.
- Owner's stated cash share conflicts with the bills: keep it as **owner says**, and list the mismatch in the cross-check with both evidence ids.
- Blurry or handwritten bill: unreadable fields are null with a low confidence, and the officer reads them. Never guess.
- Normalise Bangla numerals to digits before validation. Handle mixed Bangla and English.
- Detect duplicate or overlapping bills and flag them instead of double counting.
- A statement whose running balance does not reconcile (Tania Online Clothing): call it **does not reconcile**, never forged or fake. Ask for 12 months and a fresh statement.
- Redact phone numbers, ID-like numbers and names before any model call. Keep no image after reading.
- In the demo, counterparty types (customer, supplier, personal, utility) are seeded. Say so in the README. Real statements would need classification with officer correction.

**Verdict and AI**

- Rules and model disagree: show the disagreement notice with the reason.
- Model file missing or fails to load: rules produce the verdict, labelled as rules-only.
- Probability near the threshold: the conformal set holds both outcomes, so the verdict is **not sure**.
- Seasonal seller with under a year of history (Jahan Fish Trader): use the owner's seasonal note as **owner says**, widen the band, ask for last year's months, and do not false-alarm in a lean month.
- A festival spike (Tania) must not lift the verdict alone.
- Customer concentration is a feature and appears as a reason when high.
- Loan too large for the margin: installment to margin over 0.5 costs two points and a condition proposes a smaller first tranche.
- Counterfactual conditions may change only actionable features, never protected or unchangeable ones.
- If AI output contains a number it was not given or a forbidden word, reject it. After two failures use a template and set `generated_by` to template.
- AI call fails, times out or no key: show **DEMO FALLBACK** output. Never show an error to the user.
- Wording for a not viable verdict leads with what can change and judges the evidence, never the person.

**Decisions and follow-up**

- Override requires a reason and is logged.
- Ask for more: status returns to draft and the file lists exactly what is missing.
- Two confirmations of one field: the last wins and both are in the audit log.
- New documents after a verdict: create a new verdict and keep the old one in history.
- A skipped monthly check-in shows **no data**, not distress. Escalate to a call after two missed months.
- Owner reports strong sales but the statement drops: keep the claim as **owner says** and flag the mismatch.
- An officer can annotate a month for a one-off shock. One low month is a **watch**, two in a row is a **call**.
- Suggested actions are supportive first (call, check stock, restructure). Never punitive.

**Investors**

- Commit before verification: blocked.
- The cap check is atomic, so two simultaneous commits cannot exceed a cap.
- Show the amount still open for a partly funded case.
- Show loan size in ranges and hide names and areas, so a small shop cannot be identified.
- Seed at least one flagged case that does not fully recover, so the simulation is not rosy. Every investor page says investors can lose money.
- Never show a projected return.

**Platform**

- Seeds use fixed random seeds. **Reset demo data** restores the exact demo state.
- `/api/health` reports database and model status.
- Fonts come from npm packages, not the web.
- The intake wizard works at phone width.
- Show a warning on the intake page: do not upload real documents.
