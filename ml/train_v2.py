"""Train and evaluate on synthetic cohort v2 (EVAL_PROTOCOL.md). Every metric per segment and pooled.

T1 classifier, T2 group-conditional conformal by segment, T7 channel shift, T8 extra-evidence ablation
(Brier and calibration; band width and hold rate are computed in TypeScript), T14 fairness.
Exports ml/model/model.json (with per-segment conformal thresholds) and ml/model/metrics_py_v2.json.
"""
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "ml", "data")
OUT = os.path.join(ROOT, "ml", "model")
SEED = 2027
ALPHA = 0.10
SEGS = ["cash_led", "hybrid", "digital_first"]

meta = json.load(open(os.path.join(DATA, "cohort_v2_meta.json")))
FEATURES = meta["features"]
raw = pd.read_csv(os.path.join(DATA, "cohort_v2.csv"))
df = raw[raw.variant == "with"].reset_index(drop=True)
without = raw[raw.variant == "without"].set_index("id")
rng = np.random.default_rng(SEED)

test_mask = df.split_hint.isin(["heldout", "late_vintage"]).values
pool = np.where(~test_mask)[0]
rng.shuffle(pool)
n = len(pool)
train_idx, calib_idx, conf_idx = pool[: int(0.70 * n)], pool[int(0.70 * n): int(0.85 * n)], pool[int(0.85 * n):]
test_idx = np.where(test_mask)[0]
X = df[FEATURES].values.astype(float)
y = df.label.values.astype(int)
seg = df.segment.values


def boot(fn, yt, *preds, n_boot=500, seed=SEED):
    r = np.random.default_rng(seed)
    vals = []
    idx = np.arange(len(yt))
    for _ in range(n_boot):
        b = r.choice(idx, len(idx), replace=True)
        if len(np.unique(yt[b])) < 2:
            continue
        try:
            vals.append(fn(yt[b], *[p[b] for p in preds]))
        except ValueError:
            continue
    try:
        point = float(fn(yt, *preds))
    except ValueError:
        point = None
    if not vals or point is None:
        return point, None, None
    return point, float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def calib_slope(yt, p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    if len(np.unique(yt)) < 2:
        raise ValueError
    return float(LogisticRegression(C=1e6).fit(np.log(p / (1 - p)).reshape(-1, 1), yt).coef_[0][0])


def fit_gbm(idx, cv_idx):
    grid = [dict(n_estimators=ne, max_depth=md, learning_rate=lr, min_samples_leaf=20) for ne in (100, 250) for md in (2, 3) for lr in (0.02, 0.05)]
    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
    scores = [cross_val_score(GradientBoostingClassifier(subsample=0.8, random_state=SEED, **g), X[cv_idx], y[cv_idx], cv=cv, scoring="neg_brier_score").mean() for g in grid]
    best = grid[int(np.argmax(scores))]
    return GradientBoostingClassifier(subsample=0.8, random_state=SEED, **best).fit(X[idx], y[idx]), best


gbm, best_params = fit_gbm(train_idx, train_idx)
iso = IsotonicRegression(out_of_bounds="clip", y_min=0.02, y_max=0.97).fit(gbm.predict_proba(X[calib_idx])[:, 1], y[calib_idx])
logit = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(X[train_idx], y[train_idx])
P = lambda idx: iso.predict(gbm.predict_proba(X[idx])[:, 1])  # noqa: E731


def qhat_of(idx):
    pc = P(idx)
    s = np.where(y[idx] == 1, 1 - pc, pc)
    k = int(np.ceil((len(s) + 1) * (1 - ALPHA)))
    return float(np.sort(s)[min(k, len(s)) - 1])


qhat_pooled = qhat_of(conf_idx)
qhat_seg = {g: qhat_of(conf_idx[seg[conf_idx] == g]) for g in SEGS}

metrics = []
LIM = "Synthetic cohort v2 from our own frozen generator (assumptions in EVAL_PROTOCOL.md); robustness under held-out settings, not real-world accuracy."


def card(group, component, metric, value, ci=None, n=None, segment="pooled", limitation=LIM, baseline=None, baseline_name=None, pass_mark=None, passed=None, test=None):
    metrics.append({"group": group, "component": component, "metric": metric, "value": None if value is None else round(float(value), 4), "ci_low": None if not ci or ci[0] is None else round(ci[0], 4), "ci_high": None if not ci or ci[1] is None else round(ci[1], 4),
                    "sample_size": int(n), "level": 1, "evidence": "synthetic", "segment": segment, "limitation": limitation, "baseline": None if baseline is None else round(float(baseline), 4), "baseline_name": baseline_name,
                    "pass_mark": pass_mark, "pass": passed, "status": "done", "test": test, "generator": meta["generator_version"]})


G1 = "T1 · Classifier (per segment and pooled)"
pooled_brier = {}
for g in ["pooled"] + SEGS:
    idx = test_idx if g == "pooled" else test_idx[seg[test_idx] == g]
    yt, pt, pl, pr = y[idx], P(idx), logit.predict_proba(X[idx])[:, 1], df.rules_p.values[idx]
    auc = boot(roc_auc_score, yt, pt)
    auc_l = boot(roc_auc_score, yt, pl)[0]
    bs = boot(brier_score_loss, yt, pt)
    bs_l = brier_score_loss(yt, pl)
    bs_r = brier_score_loss(yt, pr)
    pra = boot(average_precision_score, 1 - yt, 1 - pt)
    sl = boot(calib_slope, yt, pt)
    beats = bs[0] < bs_l and bs[0] < bs_r
    if g == "pooled":
        pooled_brier = {"model": bs[0], "logistic": bs_l, "rules": bs_r}
    card(G1, "Classifier", "AUC", auc[0], auc[1:], len(idx), g, baseline=auc_l, baseline_name="Logistic baseline", test="T1")
    card(G1, "Classifier", "Brier score (lower is better)", bs[0], bs[1:], len(idx), g, baseline=min(bs_l, bs_r), baseline_name=f"Best baseline (logistic {bs_l:.4f}, rules {bs_r:.4f})", pass_mark="pooled: beats logistic and rules" if g == "pooled" else None, passed=bool(beats) if g == "pooled" else None, test="T1")
    card(G1, "Classifier", "PR-AUC for spotting closures", pra[0], pra[1:], len(idx), g, baseline=float((1 - yt).mean()), baseline_name="Closure base rate", test="T1")
    card(G1, "Classifier", "Calibration slope (1 is ideal)", sl[0], sl[1:], len(idx), g, test="T1")

G2 = "T2 · Conformal not sure, group-conditional by segment (target 90%)"
for g in ["pooled"] + SEGS:
    idx = test_idx if g == "pooled" else test_idx[seg[test_idx] == g]
    pt, yt = P(idx), y[idx]
    q = np.array([qhat_seg[s] for s in seg[idx]])
    sv, snv = (1 - pt) <= q, pt <= q
    cov = np.where(yt == 1, sv, snv).astype(float)
    conf = sv ^ snv
    pred = np.where(sv & ~snv, 1, 0)
    c = boot(lambda a, cv: cv.mean(), yt, cov)
    card(G2, "Conformal", "Empirical coverage", c[0], c[1:], len(idx), g, pass_mark="every segment within 3 points of 90%" if g != "pooled" else None, passed=bool(abs(c[0] - 0.9) <= 0.03) if g != "pooled" else None, limitation="Exchangeability is broken on purpose by the held-out shifts, so coverage can drift from the target. " + LIM, test="T2")
    card(G2, "Conformal", "Share shown as not sure", float((~conf).mean()), None, len(idx), g, test="T2")
    card(G2, "Conformal", "Accuracy of confident verdicts", float((pred[conf] == yt[conf]).mean()) if conf.any() else None, None, int(conf.sum()), g, test="T2")

# T7 channel shift: train on cash_led + digital_first, test on hybrid
G7 = "T7 · Channel shift (train cash-led + digital-first, test hybrid)"
tr_cs = train_idx[seg[train_idx] != "hybrid"]
ca_cs = calib_idx[seg[calib_idx] != "hybrid"]
gbm_cs, _ = fit_gbm(tr_cs, tr_cs)
iso_cs = IsotonicRegression(out_of_bounds="clip", y_min=0.02, y_max=0.97).fit(gbm_cs.predict_proba(X[ca_cs])[:, 1], y[ca_cs])
hy = test_idx[seg[test_idx] == "hybrid"]
p_shift = iso_cs.predict(gbm_cs.predict_proba(X[hy])[:, 1])
p_in = P(hy)
b_shift = boot(brier_score_loss, y[hy], p_shift)
b_in = brier_score_loss(y[hy], p_in)
a_shift = boot(roc_auc_score, y[hy], p_shift)
card(G7, "Channel shift", "Brier on hybrid, model never trained on hybrid", b_shift[0], b_shift[1:], len(hy), "hybrid", baseline=b_in, baseline_name="In-distribution model (trained on all segments)", test="T7")
card(G7, "Channel shift", "AUC on hybrid, model never trained on hybrid", a_shift[0], a_shift[1:], len(hy), "hybrid", baseline=roc_auc_score(y[hy], p_in), baseline_name="In-distribution model", test="T7")

# T8 extra-evidence ablation on hybrid (Brier / calibration here; band width and hold rate in TypeScript)
G8 = "T8 · Extra-evidence ablation (hybrid: with vs without online evidence)"
ids = df.id.values[hy]
Xw = without.loc[ids, FEATURES].values.astype(float)
p_wo = iso.predict(gbm.predict_proba(Xw)[:, 1])
card(G8, "Ablation", "Brier with online evidence", brier_score_loss(y[hy], p_in), None, len(hy), "hybrid", baseline=brier_score_loss(y[hy], p_wo), baseline_name="Without online evidence", test="T8")
try:
    card(G8, "Ablation", "Calibration slope with online evidence", calib_slope(y[hy], p_in), None, len(hy), "hybrid", baseline=calib_slope(y[hy], p_wo), baseline_name="Without online evidence", test="T8")
except ValueError:
    pass

# T14 fairness on pooled test
pt_all = P(test_idx)
approve = pt_all >= np.quantile(pt_all, 0.4)
F = []
for name, col, title, desc in [("independent", "group_indep", "Protected attribute independent of outcomes", "Generated at random; never a model input."),
                               ("proxy", "group_proxy", "Protected attribute correlated with location", "Group A is mostly rural; rural shops take more cash. Location is not an input, but cash share shapes the evidence.")]:
    g_ = df[col].values[test_idx]
    a, b = g_ == "A", g_ == "B"
    yt = y[test_idx]
    tpr = lambda m: approve[m & (yt == 1)].mean()  # noqa: E731
    F.append({"name": name, "title": title, "description": desc, "approval_gap_pct": round(float((approve[a].mean() - approve[b].mean()) * 100), 1), "equal_opportunity_diff_pct": round(float((tpr(a) - tpr(b)) * 100), 1), "n": int(len(g_))})
fairness = {"scenarios": F, "note": "Dropping the protected attribute does not remove a proxy effect: in the second scenario a gap can appear through cash share and coverage. Synthetic cohort v2 only."}

# export model with per-segment conformal thresholds
trees = [{"feature": e.tree_.feature.tolist(), "threshold": e.tree_.threshold.tolist(), "left": e.tree_.children_left.tolist(), "right": e.tree_.children_right.tolist(), "value": e.tree_.value[:, 0, 0].tolist()} for e in gbm.estimators_[:, 0]]
abs_err = float(np.mean(np.abs(P(calib_idx) - y[calib_idx])))
model = {
    "version": meta["generator_version"] + "-gbm1", "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "feature_names": FEATURES,
    "gbm": {"init": float(gbm._raw_predict_init(X[:1])[0][0]), "learning_rate": gbm.learning_rate, "trees": trees},
    "calibration": {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()},
    "conformal": {"alpha": ALPHA, "qhat": qhat_pooled, "qhat_by_segment": qhat_seg},
    "band_half": round(min(0.12, max(0.05, abs_err / 4)), 3), "medians": np.median(X[train_idx], axis=0).tolist(),
    "selftest": [{"x": X[i].tolist(), "p": float(P(np.array([i]))[0])} for i in test_idx[:3]],
}
os.makedirs(OUT, exist_ok=True)
json.dump(model, open(os.path.join(OUT, "model.json"), "w"))
json.dump({"run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed": SEED, "generator_version": meta["generator_version"], "params": best_params,
           "splits": {"train": len(train_idx), "calibration": len(calib_idx), "conformal": len(conf_idx), "test": len(test_idx)},
           "segment_counts_test": {g: int((seg[test_idx] == g).sum()) for g in SEGS}, "qhat": {"pooled": qhat_pooled, **qhat_seg},
           "metrics": metrics, "fairness": fairness, "pooled_brier": pooled_brier},
          open(os.path.join(OUT, "metrics_py_v2.json"), "w"), indent=1)
print("CV params", best_params, "| test", len(test_idx), {g: int((seg[test_idx] == g).sum()) for g in SEGS})
print("pooled Brier", {k: round(v, 4) for k, v in pooled_brier.items()}, "| qhat", round(qhat_pooled, 3), {k: round(v, 3) for k, v in qhat_seg.items()})
