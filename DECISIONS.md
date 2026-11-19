# Decisions

One line per choice the brief left open.

- **AI provider:** Claude through the official Anthropic SDK (default model `claude-opus-5-5`, low effort), with Gemini over REST as an alternative via `AI_PROVIDER=gemini`. Key and model come from `.env`.
- **Model export:** the gradient-boosting model is exported from scikit-learn to JSON (trees, isotonic table, conformal threshold) and evaluated in TypeScript, instead of ONNX. No native runtime to install; a self-test vector in the file checks Python/TypeScript parity at load.
- **Feature parity:** the training cohort is generated and featurised by the same TypeScript code the app uses (`npm run cohort`), and Python only trains and evaluates on the exported CSV, so training and serving features cannot drift.
- **Hybrid verdict policy:** the model can only make a file more cautious. Agree: that verdict. Opposite confident verdicts: not sure. Rules confident, model unsure: rules verdict plus a disagreement notice. Rules unsure, model confident: not sure plus a notice.
- **History rules:** both "under 6 months: -1" (rule table) and "under 12 months: -1" (corner cases) apply, so 6 months of history costs 1 point and under 6 costs 2.
- **Jahan Fish Trader** gets 12 months of history (section 8 table) rather than under a year (corner-case list), because with the "under 12 months: -1" rule a seasonal trader could never reach viable on the rule table's maximum of +3. Its seasonal pattern is still owner says, the band is widened and the file asks for last year's months.
- **Seasonality:** business type is used only to pick a seasonal profile (fish trade, knitwear); the profile is used for trend adjustment and the watchman when the type is seasonal or the owner says seasonal.
- **Festival spikes** are damped by winsorising the season-adjusted series at 1.6 times its median before trends are measured.
- **Karim Pharmacy commitments:** Karim is not sure at filing but carries seeded commitments made through the partner's pooled facility when the manager approved with conditions. The listing rule (viable verdict and approve decision) applies to new listings, so Karim is not open for new commitments.
- **Investor share:** investors may fund up to 25% of a loan through the partner's pool; "amount open" is that share minus commitments.
- **Demo investor:** `investor@demo.bd` is verified and holds commitments; `newinvestor@demo.bd` is unverified so the verification wizard and the commit block can be shown.
- **Watchman timeline:** history runs Nov 2025 to Oct 2026; "now" is Nov 2026; Simulate next month reveals up to 6 post-funding months.
- **Watchman interval:** 80% interval from empirical quantiles of one-step-ahead ratios, minimum half-width 12% (plus 6% when the seasonal profile is borrowed from the business type).
- **Missed check-ins** produce a "no data" row, never distress; two missed months in a row escalate to a call. The statement is still compared with the forecast.
- **Fixed-threshold baseline** for the watchman: alarm when a month falls more than 30% below the previous month. Shown beside each forecast for comparison.
- **Counterfactual search** tries every subset of up to 3 actionable changes and keeps the cheapest that moves the verdict up; when none can, it returns the cheapest change that moves the rule total closest to the next verdict, marked partial.
- **Phrasing:** template text by default (fast, deterministic); "Write with AI" runs the AI cross-check and phrasing with the validator. `generated_by` is `ai_phrased` or `template`; the verdict source (rules only or model hybrid) is stored separately in `verdict_source`.
- **Bill images:** the seeded bills are rendered in the browser from templates (Noto Sans Bengali on a canvas), so the AI reader receives a real PNG. Uploaded images are resized in the browser and never stored on the server.
- **Duplicate check** keys on date, direction, amount, party and running balance: split walk-in sales are not duplicates; a copied row is.
- **Auth:** JWT in an httpOnly cookie, also accepted as a bearer token so a cross-domain deployment can work without third-party cookies.
- **Rules-only band:** centre from a logistic map of the rule total, base half-width 8 points, capped at 95%.
