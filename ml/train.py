"""Train and evaluate the Bhorsha viability classifier on the synthetic cohort (brief sections 6, 7, 9).

- Gradient boosting (scikit-learn) vs a logistic baseline vs the transparent rules.
- Isotonic calibration on a separate calibration split; split-conformal prediction sets on a separate
  conformal split (target coverage 90%).
- Shop-level splits; test = later vintages plus held-out noise level and archetype mix.
- Bootstrap confidence intervals with fixed seeds so every number reproduces.
- Fairness: approval-rate gap and equal-opportunity difference for an independent protected attribute and
  for one correlated with a location proxy. The protected attribute and location are never model inputs.
Exports ml/model/model.json (evaluated in TypeScript by the server) and ml/model/metrics_py.json.
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "ml", "data")
OUT = os.path.join(ROOT, "ml", "model")
SEED = 2026
ALPHA = 0.10

meta = json.load(open(os.path.join(DATA, "cohort_meta.json")))
FEATURES = meta["features"]
df = pd.read_csv(os.path.join(DATA, "cohort.csv"))
rng = np.random.default_rng(SEED)

# ---- shop-level splits (each shop appears in exactly one split)
test_mask = df.split_hint.isin(["heldout", "late_vintage"]).values
pool = np.where(~test_mask)[0]
rng.shuffle(pool)
n = len(pool)
train_idx, calib_idx, conf_idx = pool[: int(0.70 * n)], pool[int(0.70 * n) : int(0.85 * n)], pool[int(0.85 * n) :]
test_idx = np.where(test_mask)[0]
X = df[FEATURES].values.astype(float)
y = df.label.values.astype(int)


def bootstrap(fn, yt, *preds, n_boot=500, seed=SEED):
    r = np.random.default_rng(seed)
    vals = []
    idx = np.arange(len(yt))
    for _ in range(n_boot):
        b = r.choice(idx, len(idx), replace=True)
        if len(np.unique(yt[b])) < 2:
            continue
        vals.append(fn(yt[b], *[p[b] for p in preds]))
    point = fn(yt, *preds)
    return float(point), float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def calib_slope(yt, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    lr = LogisticRegression(C=1e6).fit(np.log(p / (1 - p)).reshape(-1, 1), yt)
    return float(lr.coef_[0][0])


# ---- models
# hyperparameters chosen by 5-fold cross-validation on the TRAINING split only (never the test set)
from sklearn.model_selection import StratifiedKFold, cross_val_score

GRID = [dict(n_estimators=ne, max_depth=md, learning_rate=lr, min_samples_leaf=20) for ne in (100, 250) for md in (2, 3) for lr in (0.02, 0.05)]
cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
cv_scores = []
for g in GRID:
    sc = cross_val_score(GradientBoostingClassifier(subsample=0.8, random_state=SEED, **g), X[train_idx], y[train_idx], cv=cv, scoring="neg_brier_score").mean()
    cv_scores.append(sc)
best_params = GRID[int(np.argmax(cv_scores))]
print("CV-selected", best_params, "cv Brier", -max(cv_scores))
gbm = GradientBoostingClassifier(subsample=0.8, random_state=SEED, **best_params)
gbm.fit(X[train_idx], y[train_idx])
iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(gbm.predict_proba(X[calib_idx])[:, 1], y[calib_idx])
logit = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=1.0)).fit(X[train_idx], y[train_idx])


def p_model(idx):
    return iso.predict(gbm.predict_proba(X[idx])[:, 1])


# ---- conformal threshold: score = 1 - p(true class)
pc = p_model(conf_idx)
scores = np.where(y[conf_idx] == 1, 1 - pc, pc)
k = int(np.ceil((len(scores) + 1) * (1 - ALPHA)))
qhat = float(np.sort(scores)[min(k, len(scores)) - 1])

pt = p_model(test_idx)
yt = y[test_idx]
pl = logit.predict_proba(X[test_idx])[:, 1]
pr = df.rules_p.values[test_idx]

set_v = (1 - pt) <= qhat
set_nv = pt <= qhat
covered = np.where(yt == 1, set_v, set_nv)
confident = set_v ^ set_nv
conf_pred = np.where(set_v & ~set_nv, 1, 0)

metrics = []


def add(group, component, metric, value, level=1, ci=None, n=None, limitation="", baseline=None, baseline_name=None, pass_mark=None, passed=None):
    metrics.append(
        {
            "group": group, "component": component, "metric": metric, "value": value, "ci_low": ci[0] if ci else None, "ci_high": ci[1] if ci else None,
            "sample_size": int(n if n is not None else len(test_idx)), "level": level, "limitation": limitation, "baseline": baseline, "baseline_name": baseline_name,
            "pass_mark": pass_mark, "pass": passed, "status": "done",
        }
    )


LIM = "Synthetic cohort from our own frozen generator; robustness under held-out settings, not real-world accuracy."
auc = bootstrap(roc_auc_score, yt, pt)
auc_l = bootstrap(roc_auc_score, yt, pl)
auc_r = bootstrap(roc_auc_score, yt, pr)
bs = bootstrap(brier_score_loss, yt, pt)
bs_l = bootstrap(brier_score_loss, yt, pl)
bs_r = bootstrap(brier_score_loss, yt, pr)
pra = bootstrap(average_precision_score, 1 - yt, 1 - pt)  # PR-AUC for spotting closures
beats = bs[0] < bs_l[0] and bs[0] < bs_r[0]
G = "Viability classifier and uncertainty"
add(G, "3 · Classifier", "AUC (gradient boosting, calibrated)", round(auc[0], 3), ci=auc[1:], baseline=round(auc_l[0], 3), baseline_name="Logistic baseline", limitation=LIM + (" An AUC near 0.95 here would suggest leakage or an easy generator." if auc[0] > 0.9 else ""))
add(G, "3 · Classifier", "AUC of the transparent rules", round(auc_r[0], 3), ci=auc_r[1:], limitation="Rule points mapped to a probability; same synthetic test set.")
add(G, "3 · Classifier", "Brier score (lower is better)", round(bs[0], 4), ci=bs[1:], baseline=round(min(bs_l[0], bs_r[0]), 4), baseline_name=f"Best baseline (logistic {bs_l[0]:.4f}, rules {bs_r[0]:.4f})", pass_mark="beats logistic and rules on Brier", passed=bool(beats), limitation=LIM)
add(G, "3 · Classifier", "PR-AUC for spotting closures", round(pra[0], 3), ci=pra[1:], baseline=round(float((1 - yt).mean()), 3), baseline_name="Closure base rate", limitation="Closures are the minority class; " + LIM)
add(G, "3 · Classifier", "Calibration slope (1 is ideal)", round(calib_slope(yt, pt), 3), limitation="Isotonic calibration fitted on a separate calibration split. " + LIM)
# share of good firms approved at a fixed bad-loan rate (10%)
order = np.argsort(-pt)
best = 0.0
for cut in range(10, len(order)):
    sel = order[:cut]
    if (1 - yt[sel]).mean() <= 0.10:
        best = max(best, yt[sel].sum() / max(1, yt.sum()))
add(G, "3 · Classifier", "Share of surviving firms approvable at a 10% bad-loan rate", round(best, 3), limitation=LIM)
cov = float(covered.mean())
add(G, "4 · Conformal not sure", "Empirical coverage (target 90%)", round(cov, 3), ci=bootstrap(lambda a, c: c.mean(), yt, covered.astype(float))[1:], pass_mark="within 3 points of 90%", passed=bool(abs(cov - 0.9) <= 0.03), limitation="Held-out shift (noise, archetype mix, later vintages) can break exchangeability, so coverage may drift. " + LIM)
add(G, "4 · Conformal not sure", "Share of files shown as not sure", round(float((~confident).mean()), 3), limitation="Not sure = both outcomes in the prediction set. " + LIM)
acc_conf = float((conf_pred[confident] == yt[confident]).mean()) if confident.any() else None
add(G, "4 · Conformal not sure", "Accuracy of confident verdicts", round(acc_conf, 3) if acc_conf is not None else None, n=int(confident.sum()), limitation=LIM)

# ---- ablation: without the model (rules only) vs hybrid on viable/not-viable agreement
add(G, "Ablation", "Brier without the model (rules only)", round(bs_r[0], 4), ci=bs_r[1:], limitation="Rules-only baseline; same test set.")

# ---- fairness
def approval(p):
    return p >= np.quantile(pt, 0.4)  # approve the top 60% by probability


F = []
appr = approval(pt)
for name, col, title, desc in [
    ("independent", "group_indep", "Protected attribute independent of outcomes", "Generated at random; never a model input."),
    ("proxy", "group_proxy", "Protected attribute correlated with location", "Group A is mostly rural; rural shops take more cash, so the statement covers less. Location is not a model input, but coverage is."),
]:
    g = df[col].values[test_idx]
    a, b = g == "A", g == "B"
    gap = (appr[a].mean() - appr[b].mean()) * 100
    tpr = lambda m: appr[m & (yt == 1)].mean()
    eo = (tpr(a) - tpr(b)) * 100
    F.append({"name": name, "title": title, "description": desc, "approval_gap_pct": round(float(gap), 1), "equal_opportunity_diff_pct": round(float(eo), 1), "n": int(len(g))})
fairness = {
    "scenarios": F,
    "note": "Dropping the protected attribute does not remove a proxy effect: in the second scenario the gap appears through wallet coverage even though neither the attribute nor location is an input. A lender would need to review coverage-driven approvals for rural shops. Synthetic cohort only.",
}

# ---- export the model for TypeScript
trees = []
for est in gbm.estimators_[:, 0]:
    t = est.tree_
    trees.append({"feature": t.feature.tolist(), "threshold": t.threshold.tolist(), "left": t.children_left.tolist(), "right": t.children_right.tolist(), "value": t.value[:, 0, 0].tolist()})
init = float(gbm._raw_predict_init(X[:1])[0][0])
selftest = [{"x": X[i].tolist(), "p": float(p_model(np.array([i]))[0])} for i in test_idx[:3]]
abs_err = float(np.mean(np.abs(p_model(calib_idx) - y[calib_idx]))) if len(calib_idx) else 0.1
model = {
    "version": meta["generator_version"] + "-gbm1",
    "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "feature_names": FEATURES,
    "gbm": {"init": init, "learning_rate": gbm.learning_rate, "trees": trees},
    "calibration": {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()},
    "conformal": {"alpha": ALPHA, "qhat": qhat},
    "band_half": round(min(0.12, max(0.05, abs_err / 4)), 3),
    "medians": np.median(X[train_idx], axis=0).tolist(),
    "selftest": selftest,
}
os.makedirs(OUT, exist_ok=True)
json.dump(model, open(os.path.join(OUT, "model.json"), "w"))
json.dump(
    {
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed": SEED, "generator_version": meta["generator_version"],
        "splits": {"train": len(train_idx), "calibration": len(calib_idx), "conformal": len(conf_idx), "test": len(test_idx)},
        "metrics": metrics, "fairness": fairness, "qhat": qhat,
    },
    open(os.path.join(OUT, "metrics_py.json"), "w"), indent=1,
)
print(f"trained on {len(train_idx)} shops; test {len(test_idx)}. AUC {auc[0]:.3f} (logistic {auc_l[0]:.3f}, rules {auc_r[0]:.3f}); Brier {bs[0]:.4f}; coverage {cov:.3f}; not sure {(~confident).mean():.2f}; qhat {qhat:.3f}")
