# ML Accuracy Remediation Plan

Findings from the accuracy audit (churn / CLV / credit / lifecycle), turned into a
prioritized fix plan. Each item lists the problem, the fix, files touched, the validation
gate that must pass before it ships, and risk. **Nothing is shipped until its gate passes.**

Audit evidence lives in the analysis scripts under the outputs folder
(`validate_churn.py`, `model_experiment.py`, `calib_compare.py`, `audit_clv_credit.py`).

## Implementation status (this pass)

| Item | Status | Note |
|---|---|---|
| P1 CLV tail | ✅ shipped (prediction-layer hybrid) | works on existing artifacts; whale CLV 111k→multi-M, validated |
| P2 churn calibration | ✅ in code | takes effect on next churn retrain |
| P3 credit monotonicity | ✅ shipped | 0 cross-horizon violations, no retrain needed |
| P4 needs_review | ✅ shipped | flags 287348-type cases |
| P5 segments + action_rank | ✅ code shipped | run `db:introspect` + typecheck + web UI remain |
| P6 stale metrics/docs | 🔧 partial | honest numbers documented; legacy `models/metrics.json` cleanup remains |

Validation: `validate_fixes.py` (CLV whales uncapped, credit monotonic, needs_review,
segments + action_rank) and `clv_experiment.py` (hybrid tail capture 0.38→0.69).

---

## Status legend
- ✅ done in code (needs retrain/run to take effect)
- 🔧 to do
- 🧪 needs a validation experiment before it can ship

---

## P1 — CLV tail ceiling 🧪🔧 (highest impact)

**Problem.** The CLV champion (`lgbm_tweedie`) saturates at ~111k THB. Backtested vs real
6-month revenue, the top-20 customers' predictions sum to only **2.5%** of actual
(e.g. acc 282926: actual 9.66M → predicted 111k). Tree regressors cannot isolate the few
whales into pure leaves, so they get pooled down.

**Why not just swap to BG/NBD.** BG/NBD captures whales (78% of top-20) but destroys the
body: overall Spearman drops 0.58 → **0.07**, median abs error 2.5k → 24k. A blind swap
trades one failure for a worse one.

**Fix (validate all three, pick by gate):**
1. Re-train the regressor on **`log1p(future_revenue_6m)`**, predict, `expm1` back — lets the
   model represent orders of magnitude without the raw-space ceiling.
2. **Hybrid**: Tweedie for the body, BG/NBD only for the high-frequency / high-monetary tail
   where Tweedie saturates (threshold tuned on validation).
3. Keep Tweedie but add value-weighted sample weights.

**Selection gate (new).** Add a **tail-capture metric** to CLV champion selection:
`top-decile predicted-revenue capture ratio` and `weighted MAPE on value tier A`. A model may
not win on overall Spearman/MAE while failing the tail — that is what hid this bug.

**Files.** `apps/ml/src/training/clv_trainer.py` (target transform / hybrid + metric),
`apps/ml/src/training/metrics.py` (tail metric), `apps/ml/src/prediction/runner.py::_apply_clv`
(if hybrid routing is added). **Requires CLV retrain + promotion.**

**Validation gate.** New CLV beats current Tweedie on tail capture by a clear margin AND does
**not** regress body medAE or overall Spearman beyond tolerance. Backtest at ≥2 cutoffs.

**Risk.** Medium — touches CLV training. Mitigated by the body-regression guardrail in the gate.

**Downstream note.** Until P1 ships, `revenue_at_risk`, `priority_score`, and the segment
money-ranking **undervalue whales ~40×**. Interim mitigation: rank top customers by
`customer_value_tier` / CLV percentile, not by absolute `revenue_at_risk`.

---

## P2 — Churn calibration clustering ✅ (ship on next retrain)

**Problem.** Isotonic calibration quantized churn scores to ~129 distinct values (k/n
plateaus, ceiling 0.88), losing within-tier ranking.

**Fix — DONE in code.** `_fit_calibrator` now defaults to Platt/sigmoid and only picks
isotonic when it beats Platt on Brier by ≥2% (`ISOTONIC_BRIER_MARGIN`). Backtest: Platt gives
Brier 0.1273 (≈isotonic), AUC 0.882 (>0.878), ECE 0.029 (passes <0.05 gate), and **2,367**
distinct values.

**Files.** `apps/ml/src/training/churn_trainer.py` (committed).

**Validation gate.** Next churn training run must keep ECE < 0.05 (existing gate) — already
verified in backtest.

**Risk.** Low. Reversible (raise the margin to restore old behavior).

**To deploy.** Re-train + re-promote churn; current champion still uses isotonic until then.

---

## P3 — Credit cross-horizon monotonicity 🔧 (quick, no retrain)

**Problem.** Within-horizon quantiles are clean (0% crossing), but the 90d median is below
the 30d median for **3.3%** of customers (independent quantile heads).

**Fix.** One guard in `_apply_credit`: `pred_90d = max(pred_90d, pred_30d)` (and same for the
matching p10/p90 bounds). No retrain — takes effect on the next prediction run.

**Files.** `apps/ml/src/prediction/runner.py::_apply_credit`.

**Validation gate.** Re-run a prediction; cross-horizon violation = 0%.

**Risk.** Very low.

---

## P4 — Decision-layer "needs review" flag 🔧 (no retrain)

**Problem.** A few high-value customers with collapsed recent usage get a low churn score but
`p_alive ≈ 0` (the 287348 pattern). Churn alone misses them.

**Fix.** Add `needs_review = churn_at_risk OR (high value AND p_alive low AND usage declining)`
as an output field, so the two-model disagreement surfaces for a human. (Already encoded in the
segmentation `health` axis — this just promotes it to a first-class flag.)

**Files.** `apps/ml/src/prediction/runner.py::_apply_derived`, output contract doc, optional
column in `ml_prediction_outputs`.

**Validation gate.** 287348-type cases land in the flag; no flood of false positives
(spot-check rate on the dataset).

**Risk.** Low — additive, no model change.

---

## P5 — Wire customer segments into the product 🔧

**Problem.** Segmentation (`docs/CUSTOMER-SEGMENTS.md`) is designed but not in the pipeline.

**Fix.** Add `segment text` + `action_rank int` to `db/init/001_schema.sql`, compute in
`_apply_derived` (all inputs already on `frame`), expose `segment` as a filter on
`/runs/:id/outputs`.

**Files.** `db/init/001_schema.sql`, `apps/ml/src/prediction/runner.py`,
`apps/api/src/routes/prediction-runs`, web outputs table.

**Validation gate.** Segment counts match the reference script on the same run.

**Risk.** Low–medium (schema change + dashboard). Depends on **P1** for correct money-ranking.

---

## P6 — Fix stale metrics & expectations 🔧

**Problem.** Top-level `models/metrics.json` is legacy (reports churn AUC 0.94, CLV Spearman
0.77). Honest out-of-sample numbers are churn ~0.88–0.89 and CLV Spearman ~0.58 with a tail
blind spot.

**Fix.** Treat the per-version `model_card.json` as source of truth; remove/flag the legacy
top-level file; update any docs quoting 0.94. Add the tail metric (P1) to the recorded CLV
metrics.

**Files.** `models/` cleanup, `docs/ML-V2-*.md` figures.

**Risk.** None (documentation).

---

## Suggested order

1. **P3** + **P4** — quick, no retrain, immediate value (ship this prediction run).
2. **P1** — run the 3-way CLV experiment, pick the winner by the new tail gate.
3. Batch retrain: churn (picks up **P2**) + CLV (**P1**) in one promotion cycle.
4. **P5** — wire segments once P1 makes the money-ranking trustworthy.
5. **P6** — update docs/metrics alongside the retrain.

## Production-readiness recheck

Cleaned this pass (behavior-preserving, validated against the reference run):
- CLV hybrid extracted to `_blend_clv_tail` with named constants (`CLV_TAIL_QUANTILE`,
  `CLV_TAIL_MIN_POPULATION`, `CLV_TAIL_MIN_FREQUENCY`) + a **small-population guard** so
  single/tiny scoring runs don't blend on meaningless percentiles.
- `_apply_segments` vectorized with `np.select` (removed the ~30k-row Python loop).
- `_apply_clv` now **warns** when a Tweedie champion ships without a BG/NBD bundle
  (tail would silently stay capped).
- pyflakes clean (no unused imports / undefined names) on the edited modules.

Flagged for follow-up (not changed — needs tests / out of bug-fix scope):
- **Perf**: `_build_output_rows` and `_apply_descriptive` use `frame.iterrows()` — fine at
  ~30k rows (seconds), but scales poorly. Move to `itertuples`/vectorized JSON if runs grow.
- **No Python↔TS constants sync test**: `constants.py` and `constants.ts` must match (verified
  manually 29/29). Add a tiny CI check so they can't drift.
- **Small-population runs**: value tier / segment / priority use run-relative percentiles, so
  scoring very few customers yields noisy tiers (batch scoring assumed). Documented, not a bug.

## Out of scope (decided against)
- Swapping churn champion to a tree — rejected by the promotion gate (unstable across
  backtest cutoffs); not a fix.
- Swapping CLV champion to BG/NBD — destroys body accuracy (see P1).
- Adding churn features / changing labels — no evidence of systematic model error.
