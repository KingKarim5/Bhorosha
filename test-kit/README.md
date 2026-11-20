# Bhorsha test kit

Everything you need to test Bhorsha from scratch, the way a real shop owner, lender and investor would use it. It takes about 40 minutes. Work through the parts in order: later parts use what you made earlier.

**Site:** https://bhorosha.vercel.app
**All data is synthetic.** Never upload real documents, real names, ID numbers or phone numbers.

## What is in this folder

| File | Used in | What it is |
| --- | --- | --- |
| `statements/1_healthy_shop_12_months.csv` | Part 2 | Wallet statement of a healthy tea stall: 12 months, growing sales, suppliers paid on time |
| `statements/2_tampered_statement.csv` | Part 5 | The same kind of shop, but 40 amounts were edited without fixing the running balance |
| `statements/3_short_history_2_months.csv` | Part 5 | Only 2 months of history |
| `online-seller/wallet_statement.csv`, `courier_settlements.csv`, `order_log.csv` | Part 6 | A shop that also sells online with cash on delivery |
| `bills/bill_1_matches_wallet.png` | Part 2 | Jamuna Distributors memo, Tk 18,780, paid by bKash on 10/10/2026. It matches a payment in the healthy statement |
| `bills/bill_2_cash_not_in_wallet.png` | Part 2 | Rupali Traders memo, Tk 7,350, paid in cash. It has no matching wallet payment |
| `notes/owner_note_bangla.txt` | Part 2 | The owner's note in Bangla (cash share, margin, suppliers) |
| `contracts/A_unclear_late_clause.txt` | Part 4 | Loan contract whose late fee is "as agreed verbally" |
| `contracts/B_fixed_terms.txt` | Part 4 | Loan contract with fixed figures: 25% early rebate, +3 points late penalty |
| `contracts/C_wrong_amount.txt` | Part 4 | Loan contract for Tk 95,000 when the shop asked for Tk 80,000 |
| `contracts/D_rate_too_low.txt` | Part 4 | Loan contract at 10% a year, below what the investors and Bhorsha's fee need |
| `contracts/E_missing_late_clause.txt` | Part 4 | Loan contract with no late repayment clause at all |

Tick each **Expect** line as you go. If something does not match, write it down with the template at the end.

---

## Part 1: Create your lending institution

Every lender is its own institution: it sees only the applications sent through its own link, with its own policy, watchlist and repayments. Nobody else sees them.

1. Open the home page and press **I'm a lender**. Institution name: something unique, for example `Padma Microfinance FA`. Then your name, an email (made up is fine, for example `fa.lender@example.com`) and a password of 8 or more characters. Press **Create lender account**.
- [ ] **Expect:** you land on the **Lender console** of your institution: policy v1, AI deciding, **no decisions yet**, and a card **Application link for <your institution>** (`…/apply/<your-code>`).
2. Press **Copy link** and keep it. This is the link you would send to shop owners.

## Part 2: Apply as a shop owner (no account needed)

1. Open your copied link in a **private window** (the owner is not logged in).
- [ ] **Expect:** the form says **You are applying to <your institution>** and shows its limits: up to Tk 10,00,000 for up to 12 months, at 14% a year.
2. **Step 1, Consent:** tick the consent box. Shop label: `Kit Tea Stall <your initials>` (for example `Kit Tea Stall FA`). How do you sell: **Mostly in the shop**. Business type: **Tea stall / grocery**. Months trading: `24`. Loan ask: `80000`. Tenor: `12`. Purpose: `Bulk stock before winter`. Purpose type: **Working capital**. CIB status: **Clean**.
3. **Step 2, Statement:** choose `statements/1_healthy_shop_12_months.csv`.
4. **Step 3, Bill photos:** add both images from `bills/`.
5. **Step 4, Note:** paste the text of `notes/owner_note_bangla.txt`. Cash share: `50`. Margin: `20`. Seasonal: **No**.
6. Submit. You land on the **owner's private page**. Copy its link and keep it (you need it in Parts 4 and 7).

- [ ] **Expect:** the decision is **Approved with conditions**, in plain Bangla or English (switch with বাংলা / EN at the top).
- [ ] **Expect:** under *Questions for you*, a Bangla question about the Tk 7,350 Rupali Traders bill (it was paid in cash, so the wallet cannot show it). Answer it, for example `দোকানে নগদে দিয়েছি`.
- [ ] **Expect:** *Read aloud* reads the page out.

## Part 3: Read the AI decision (lender)

1. Back in your lender window, go to **AI decisions**.
- [ ] **Expect:** only your own case is there (no demo shops, nothing from other testers).
2. Open your **Kit Tea Stall** case.
- [ ] **Expect:** the **Agent trace** lists the agents in order: Intake → Verifier → Contract reader → Underwriter → Pricing → Fee explainer → Servicer, each with what it did.
- [ ] **Expect:** under **Documents and AI reading**, the Jamuna bill shows **checked** ("Matches a wallet payment of 18780 BDT on 2026-10-10 to the same supplier") and the Rupali bill shows **unmatched**. The fields were read from the photo by the AI.
- [ ] **Expect:** under **Evidence**, every claim is labelled **checked** (matched to the money trail) or **owner says**. Your answer from Part 2 appears as *owner says*.
- [ ] **Expect:** under **Loan terms and repayments**: limits ✓, rate setup ✓, contract **Clear**, **Pricing** set by the agent inside the bands (rebate 10–30%, penalty 1–4 points), and **How the interest is shared** (investors, Bhorsha, lender out of every Tk 100).
3. Press **Cross-check and write with AI**. The summary is rewritten by the AI; every number it writes is checked against the file.
4. In **Ask this file**, ask `Are supplier payments on time?`, then `Will the owner repay?`.
- [ ] **Expect:** the first gets an answer with evidence ids like `[E3]`; the second is politely declined (the file judges evidence, not people).

## Part 4: Test the loan contract (lender)

Stay on the Kit Tea Stall case, section **Loan terms and repayments**. Press **View or replace the contract text**, paste a contract from `contracts/`, and press **Save and read it again**.

| Paste | Expect |
| --- | --- |
| `A_unclear_late_clause.txt` | Contract **Unsure: held for the lender**; the decision becomes **On hold**. A **Confirm the terms** box appears. Enter rebate `20`, penalty `2` and press **Confirm and re-run the agents**: the case goes back to **Approved with conditions**. |
| `B_fixed_terms.txt` | Contract **Clear**; **Pricing** shows exactly 25% and +3 points, because a figure fixed in the contract wins over the agent. |
| `C_wrong_amount.txt` | Contract **Fails the code checks**: "principal (Tk 95,000) differs from the application (Tk 80,000)". The case is **On hold**. |
| `D_rate_too_low.txt` | Contract reads **Clear**, but **Rate setup** turns ✗: "Borrower rate 10% is below the investor rate 10.25% plus Bhorsha's fee … at least 11.15% is needed". The case is **On hold** until a contract at an allowed rate is uploaded. |
| `E_missing_late_clause.txt` | Contract **Fails the code checks**: "No late repayment clause was found." The case is **On hold**. |

Finish with `B_fixed_terms.txt` so the case ends approved.

## Part 5: Applications that must NOT be approved

Repeat Part 2 three more times, always through **your own link** (label `Kit Bad 1`, `Kit Bad 2`, `Kit Big`). Leave out the bills and the note to save time.

| Statement | Loan ask / tenor | Expect |
| --- | --- | --- |
| `2_tampered_statement.csv` | 80000 / 12 | **On hold**: "The statement does not reconcile". The owner is asked for a fresh 12-month statement. |
| `3_short_history_2_months.csv` | 80000 / 12 | **On hold**: fewer than 3 months of statement. |
| `1_healthy_shop_12_months.csv` | 1200000 / 18 | The form already warns that this is above your limit; apply anyway. **Not this time, with a plan**: above Tk 10,00,000 and longer than 12 months. The owner's page shows **What the lender can offer** (a smaller loan over 12 months). Press **Accept this offer**: the agents run again and the case is approved at the offered amount. |

As the lender, open **Kit Big**: the **Counter-offer** card shows the amount, tenor and monthly instalment, and says the code clamped it.

## Part 6: An online seller (shop + cash on delivery)

Apply again through your link (`Kit Online`). How do you sell: **Shop and online**, online share `60`. Business type: **Other**. Loan ask `120000`, tenor `12`. Step 2: the statement `online-seller/wallet_statement.csv`, plus `courier_settlements.csv` and `order_log.csv` in the *Online sales* boxes. Cash share `40`, margin `30`.

- [ ] **Expect:** the lender case shows courier payouts matched to wallet credits after fees ("courier settlements … matched to wallet credits"), and the returns rate from the order log.
- [ ] **Expect:** any courier batch that could not be matched becomes a question to the owner.

## Part 7: Release the money and take repayments (lender)

**A. Your own loan.**
1. Open your approved **Kit Tea Stall** case. Under **Loan terms and repayments**, press **Release funds**.
- [ ] **Expect:** the first part of the loan is released through the licensed partner (simulated), and a repayment schedule appears with a loan reference like `LN-XXXX`. The case moves to **Watchlist** and **Repayments**.
2. Go to **Repayments** and use **Send a test payment** (press **Pay** next to your loan to fill the form):

| Try | Expect |
| --- | --- |
| Reference filled, exact amount | **Applied**, matched by reference, **On time** |
| Press **Pay early** instead (it fills a date 5 days before the due date and the discounted amount) | **Applied**, **Early**, with "saved Tk …": part of that instalment's interest is waived. The schedule shows "early, saved …" and the owner's receipt says how much was saved |
| Clear the reference, keep the payer | The AI matches it by payer, amount and timing, with a confidence. High confidence is applied; low confidence goes to the review queue |
| Clear the reference and change the payer to `Unknown wallet` | **Sent to the review queue**, not applied. Choose your loan and press **Apply to this loan**, or **Reject** |
| Amount at half the instalment | Applied as **partial** |
| Received date 10 days after the next due date | **Late**; the Watchman decides whether it is a real warning or seasonal, and the owner gets a late notice |
| Tick **Send with a wrong signature** | **Refused** ("Signature check failed"); nothing is recorded |

3. On your case press **Early-settlement quote**.
- [ ] **Expect:** the total to settle today, with the rebate on the interest still to come.
4. Open your shop's owner page (the link from Part 2).
- [ ] **Expect:** *Your repayments* with progress and the next due date, and *Messages* with receipts, late notices and the quote. **How much to repay everything today?** gives the same quote to the owner.

**B. Six months of a loan book (demo institution).** Your new loan has no future sales data yet, so the watchman's monthly sales checks are shown on the demo institution, which has four loans with six months of synthetic history. Log out and log in as `lender@demo.bd` (password `bhorsha-demo`).

1. Go to **Watchlist** and press **Simulate next month** twice (each press moves that institution's clock one month).
- [ ] **Expect:** Karim Pharmacy's sales fall below the forecast band: first **watch**, then **call**. Jahan's seasonal dip stays calm.
- [ ] **Expect:** under *Repayments through the webhook*, each funded loan's instalment arrives. Karim's late payment is read by the Watchman as a **Real warning**; Jahan's late payment as a **Seasonal pattern**; Rafi's payment without a reference is **sent to review**.
2. Go to **Repayments**.
- [ ] **Expect:** Rafi's payment waits in the **Review queue** with a low confidence. Choose the loan and press **Apply to this loan**.
3. Open **Karim Pharmacy** → **Owner's link**.
- [ ] **Expect:** receipts and a supportive late notice under *Messages*.

Log back in to your own institution afterwards.

## Part 8: Change the policy (lender)

In your own institution, go to **Policy**. Changes apply only to your institution.

| Try | Expect |
| --- | --- |
| Borrower rate `11`, save | **Refused**: below the investor rate plus Bhorsha's fee (at least about 11.13% is needed) |
| Early-payment discount `50`, days `3`, save | Back on **Repayments**, the note above the review queue shows the new terms and **Pay early** offers a bigger saving. Set it back to `25` and `5` afterwards |
| Largest loan `50000`, save | Saved as a new version. Re-run a case (Cross-check button): an ask above Tk 50,000 now gets a counter-offer. Set it back to `1000000` afterwards |
| On the **Lender console**, press **Pause AI decisions** | New decisions are holds while paused ("AI decisions are paused"). Press **Resume AI decisions** afterwards |

## Part 9: Sign up as an investor

1. Log out (top right). On the home page press **I'm an investor** and create an account.
- [ ] **Expect:** you land on **Investor verification** with status `not_started`.
2. Verification (simulated, nothing real):
   - Identity: first type `01712345678`.
   - [ ] **Expect:** refused, "Do not enter a real ID or phone number". Then type `DUMMY-1234` and confirm.
   - Source of funds: choose **Salary or business income** and confirm.
   - Risk acknowledgement: tick the box and confirm.
- [ ] **Expect:** status becomes **verified**.
3. Go to **Listings**.
- [ ] **Expect:** only loans the AI approved are listed, from every institution, each showing which lender it belongs to and without shop names. Your Kit Tea Stall is there under your institution's name, even before you released its funds.
- [ ] **Expect:** each card shows **You earn 10.25% a year** and what Tk 10,000 brings back (for example Tk 10,564 over 12 months).
4. Open a listing.
- [ ] **Expect:** the evidence with checked / owner says labels, the lender's conditions, and **How the interest is shared** (investor rate 10.25% = bank rate 10% + 0.25%), marked as not a promise.
5. Type different amounts in the commit box: the box under it shows the interest you earn, the total you get back and the monthly amount. Commit `10000`.
- [ ] **Expect:** "Simulated commitment recorded". Try `60000` on one loan: **refused**, over your Tk 50,000 per-loan cap.
6. In **Suggested spread**, enter `100000`.
- [ ] **Expect:** a split across the listed loans within your caps.
7. Go to **Portfolio**.
- [ ] **Expect:** totals (put in, interest you earn, total coming back, received so far), then the same **by lender**, then each loan. A loan whose funds are not released yet says *Waiting for the lender to release*.
- [ ] **Expect:** after the lender releases the loan and an instalment is paid (Part 7), **Received so far** goes up by your share. The page refreshes on its own every 20 seconds.

## Part 10: Language and phone

- [ ] Switch to **বাংলা** on every page: all text, numbers and dates show in Bangla.
- [ ] Open the owner's page on a phone: large text, everything readable without zooming.

---

## Report a problem

Copy this for each problem:

```
Part and step:   (e.g. Part 4, contract A)
What I did:
What I expected: (the Expect line)
What happened:
Screenshot:      (attach)
Link:            (the page address)
```

Note: when the demo is reset, accounts and cases made during testing are cleared. An administrator account (set up by the project owner) sees every lender institution and investor at **/admin**.
