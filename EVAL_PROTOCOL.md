# Bhorsha evaluation protocol (v2)

Written and committed **before** any v2 evaluation run. Pass marks below are fixed here and must not change after results are seen. If the generator has to change, it gets a new version and both versions are reported. The `/evaluation` page shows the commit hash of this file.

All results are **synthetic** unless labelled **public real data**. Synthetic results show that the pipeline behaves as designed under our own stated assumptions; they are not real-world accuracy.

## 1. Segments

| Segment | Definition | Evidence available |
| --- | --- | --- |
| `cash_led` | Most sales taken in cash in the shop; the wallet sees 20% to 60% of turnover | Wallet statement, bills, Bangla note |
| `hybrid` | A physical shop plus online orders: 30% to 60% of sales in-shop cash, the rest online (courier cash-on-delivery and prepaid) | Wallet statement, courier settlement CSV, order log, bills, note |
| `digital_first` | 80% to 95% of sales online | Wallet statement, courier settlement CSV, order log |

Segment is used for the watchman cadence (weekly for `hybrid` and `digital_first`, monthly for `cash_led`), festival adjustment, and group-conditional conformal calibration. It is not a protected attribute and is not a model feature.

## 2. Generators

### cohort-v1 (frozen, superseded)
3,000 cash-led-style shops, 12 to 18 months, six latent archetypes, hidden hazard for closure, 5% label noise, 12% held-out noise level. Results kept and shown as v1.

### cohort-v2 (this protocol)
Stated assumptions, chosen before seeing any result and not tuned to results:

- **Size and mix:** N = 3,000 shops, seed 2027. Segment shares 45% cash_led, 30% hybrid, 25% digital_first.
- **History:** 12 to 18 months before the loan date; loan vintage spread over 24 months.
- **Archetypes** (one primary, 30% chance of a second): healthy, stock_problem, late_payers, household_mixing, seasonal, declining, high_returns (online segments only).
- **Online sales:** orders per day 1.5 to 4.5, average order 400 to 1,500 BDT; 60% to 80% cash-on-delivery through a courier, the rest prepaid to the wallet.
- **Courier noise:** fee 50 to 120 BDT plus 0.5% to 1.5% of the order; weekly payout batches; settlement-to-wallet lag uniformly 1 to N days with N drawn from {3, 7, 14} (so some payouts land after the 10-day matching window); up to 1% partial remittances; one payout batch missing from the wallet in 30% of shops; duplicate wallet credits in 10% of shops (about 3% of their batches); some weeks with no orders.
- **Returns:** 2% to 8% normally, 12% to 25% for high_returns.
- **Festival spikes:** the shared Bangladesh festival calendar (two Eids, Pohela Boishakh, Durga Puja) lifts online orders by 1.3 to 2.0 times.
- **Hidden hazard for closure within 12 months:** the v1 hazard plus +0.06 per percentage point of returns above 10% (online segments). 5% label noise.
- **Fairness:** a protected attribute independent of the outcome, and a second one correlated with a location proxy (rural shops take more cash). Neither is ever a model input.
- **Held-out test conditions:** later vintages, the noise level 0.14, and the archetype mix seasonal + declining.
- All cohort shops are flagged `synthetic_cohort` and never appear in demo lists.

The generator is frozen once committed. Model hyperparameters may be chosen by cross-validation on the training split only.

## 3. Splits

Shop-level: a shop is in exactly one split. Test = later vintages plus held-out noise and archetype mixes. The remaining pool is split 70 / 15 / 15 into train, calibration (isotonic) and conformal calibration. Features use only data before the loan date.

## 4. Tests and pass marks

Bootstrap 95% confidence intervals (500 resamples, fixed seed) are reported for every proportion and score. Every metric is reported per segment AND pooled, with sample sizes.

| # | Test | Metrics | Pass mark (fixed now) |
| --- | --- | --- | --- |
| T1 | Classifier | AUC, PR-AUC (closures), Brier, calibration slope; per segment and pooled | Pooled Brier beats both the logistic baseline and the rules (CI reported) |
| T2 | Conformal "not sure", group-conditional by segment (90% target) | Empirical coverage, share not sure, accuracy of confident verdicts, per segment | Every segment's coverage within 3 points of 90% |
| T3 | Healthy-shop approval rate | Share of truly healthy shops (archetype healthy, still trading) that the fail-safe Underwriter approves, per segment | Reported, with the gap between segments stated honestly; no pass mark |
| T4 | Fail-safe | Seeded traps per segment (statement does not reconcile, under 3 months, rules not viable, model contradiction, unanswered material evidence, AI paused) | 100% of traps not approved in every segment |
| T5 | Circuit breaker | Decision streams with injected hold-rate and default-rate spikes | Trips on the first check after a limit is crossed, never before; 0 approvals while paused (100%) |
| T6 | Matching | Precision, recall and false-checked rate of courier payout matching on synthetic settlements with injected noise | Recall at least 0.90; false-checked rate at most 1% |
| T7 | Channel shift | Train on cash_led + digital_first, test on hybrid | Reported against in-distribution performance; no pass mark |
| T8 | Extra-evidence ablation (hybrid) | With vs without online evidence: band width, hold rate, Brier and calibration slope | Reported; no pass mark |
| T9 | Watchman | Median lead time before full decline, false alarms per borrower-year, against a fixed 30% threshold; monthly for cash_led, weekly for online segments | Median lead time at least 2 periods; fewer false alarms than the fixed threshold in each cadence |
| T10 | Tamper | Detection by number of edited balance rows; false positives on clean statements | Full curve reported, no single headline |
| T11 | Counterfactual conditions | Validity, features changed, protected or unchangeable features touched | At least 90% valid; zero protected or unchangeable changes |
| T12 | Redaction and validator | Leaks in synthetic notes; seeded bad outputs rejected | Zero leaks; all seeded bad outputs rejected |
| T13 | Allocator | Cap compliance, concentration against a naive split | 100% compliance; lower concentration |
| T14 | Fairness | Approval-rate gap and equal-opportunity difference for the independent and the proxy-correlated attribute | Reported; no pass mark |

## 5. Public real data (stretch, step 11)

- **Olist (Brazil e-commerce, 2016 to 2018):** only if `data/olist/` exists. Sellers with at least **N = 26 weeks** of order history (fixed here, before looking). Weekly aggregation, empirical coverage of the forecast band against its nominal level, false alarms against the fixed threshold. "Seller inactive in the last window" is only a labelled survival proxy, never a default. Limits: Brazil, 2016 to 2018, a reviewed-purchases sample, licence to be confirmed.
- **Berka (PKDD'99 Financial):** only if `data/berka/` exists: the transaction-to-outcome check with stratified cross-validation, respecting the loan date.
- If a folder is missing the test is listed as **planned**.

## 6. What the evaluation cannot show

That Bhorsha works on real Bangladeshi shops; that the hybrid generator matches real hybrid sellers (it rests on the assumptions above); that our courier and marketplace CSV formats match real exports (unconfirmed); that the investor side would attract investors; that Bangla extraction is reliable on real handwritten documents.
