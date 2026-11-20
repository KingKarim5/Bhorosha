# Demo statements for a manual test

Synthetic wallet statements in the format Bhorsha reads (`date,description,direction,amount_bdt,balance_after_bdt,counterparty_kind,counterparty,due_date`). Upload one at **/apply** (Choose a CSV file), answer the form, then open the case as the lender.

| File | What it shows | Expected AI decision |
| --- | --- | --- |
| `1_healthy_shop_12_months.csv` | 12 months, growing sales, suppliers paid on time | `approved_with_conditions` for a modest ask (for example Tk 80,000 over 12 months, 50% cash, 20% margin) |
| `2_tampered_statement.csv` | 40 amounts edited without fixing the running balance | `hold_need_evidence`: the statement does not reconcile |
| `3_short_history_2_months.csv` | Only 2 months of history | `hold_need_evidence`: fewer than 3 months |

Ask for more than Tk 1,000,000 or longer than 12 months with the healthy file and the Counter-offer agent proposes a smaller loan inside the limits.
