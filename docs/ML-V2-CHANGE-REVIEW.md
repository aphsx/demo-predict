# ML v2 — Change Review & Senior Assessment (2026-06)

This document records a working cycle of changes to the model lifecycle, the ML
training pipeline, and the supporting API/UI, plus a senior-level review of the
result. It is a point-in-time companion to the canonical specs in
[`docs/README.md`](README.md); where it disagrees with code, trust the code.

---

## 1. Scope of this cycle

Three workstreams shipped together:

1. **Model deletion** — a manual, confirmation-gated way to delete non-production
   model versions (artifacts + registry row), end to end.
2. **Disk hygiene** — removed orphaned v1 (pre-registry) artifacts from `models/`.
3. **ML quality** — algorithm/feature/training improvements after a code+data
   review, plus two latent-bug/robustness fixes.

Nothing in the canonical ML pipeline was refactored for style; all changes are
additive or targeted fixes and preserve the existing contracts (registry,
promotion gate, point-in-time safety, `feature_code_hash`).

---

## 2. Model deletion (manual, confirmation-gated)

Mirrors the existing `model-activate` path across all layers:

| Layer | Change |
|---|---|
| ML registry | `delete_model_version()` — refuses the production champion, removes the on-disk artifact dir, deletes the `ml_model_versions` row, and records an `action='delete'` row in `ml_model_activation_history`. |
| FastAPI (internal) | `POST /internal/model-delete` (token-gated, synchronous). |
| Elysia | `DELETE /model-performance/:modelType/versions/:id`. Maps the ML guard's HTTP 400 → **409 Conflict** (not 502); passes `created_by`. |
| Web client | `deleteModelVersion()` in `ml-api.ts`. |
| Web UI | Trash button per **non-production** version in the Model Accuracy version switcher + a `StatusDialog` warning confirmation (same UX as deleting a prediction run). |

**Safety properties**

- The production champion can never be deleted — blocked in the UI (no button)
  *and* in the registry (raises). The prediction runner only ever loads via the
  `production` alias, so a deletable version is by definition not in serving.
- FK cascades clean up dependents: `ml_model_evaluations` and `ml_model_aliases`
  are `ON DELETE CASCADE`; `ml_model_activation_history` is `ON DELETE SET NULL`,
  so the **audit trail survives** (the deleted version's id is also written into
  the `reason` text, which no FK can null).
- Deletion is recorded in `ml_model_activation_history` with the acting user.

---

## 3. Disk hygiene

Removed 17 orphaned pre-registry artifacts (~7.5 MB) from the `models/` root
(`churn_model.pkl`, `credit_q*.pkl`, `ltv_*.pkl`, eval PNGs, root `metrics.json`,
etc.) after confirming no code referenced them. Kept the registry version
directories (`models/{type}/{version}/`) and files still referenced by verify
scripts (`preprocessor_config.json`) or regenerable by them.

> Note on storage strategy: at ~33 MB for 18 versions (≤100 MB even at 10
> versions/type), **separate object storage is not warranted for size**. The real
> consideration is **persistence** — keep `models` on a named, backed-up volume,
> because the registry rows reference artifact paths. Move archived artifacts to
> R2/S3 only when deploying across multiple/ephemeral hosts (Phase 2).

---

## 4. ML quality changes

### 4.1 Churn Optuna search reduced (100 → 40 trials)
At this dataset's labelled size (~1.5–2k active-paid rows per cutoff), a 100-trial
search overfits the tuning split for negligible CV gain. The promotion gate (vs
baselines + incumbent), not search depth, is the real arbiter.

### 4.2 New point-in-time features (additive, all three models)
Added to the base Tier-A contract (24 → 27; credit 28 → 31):

| Feature | Definition | Rationale |
|---|---|---|
| `payment_amount_cv` | `std(amount)/mean(amount)` over pre-cutoff payments (nullable < 2 payments) | Separates steady payers from spiky/whale top-ups. |
| `channel_hhi` | `sms_share² + email_share²` | Concentration across the SMS/Email product lines (1.0 = single-channel). |
| `multichannel_flag` | `1.0` if both SMS and Email usage > 0 | SMS and Email are distinct products; multi-channel customers behave differently. |

All are pure functions of features already computed `< cutoff` (no new leakage
surface). The change is **backward compatible**: existing champions keep serving
on their stored feature subset; new champions opt into the larger set. Train and
predict both build features via `build_all_features`, so the contract stays
consistent (verified: prediction produces the new columns).

> Deliberately **not** added (with reasons): **days-to-expiry** — the 8-sheet
> schema has no per-top-up expiry term, so a PIT-safe reconstruction isn't
> possible (the snapshot `expire_*` reflects export time = leakage), and it is
> largely redundant with the existing `credit_runway_months`. **Cutoff
> seasonality** — the cutoff is a single date per run, so a "cutoff month"
> feature is constant across all customers in a run (zero per-customer variance =
> useless).

> The near-zero email-channel signal in the current sample is a **mockup-data
> artifact** (email volume under-represented), not a reason to drop email
> features. They are structural and PIT-safe; keep them and re-judge with SHAP on
> real data.

### 4.3 Multi-cutoff panel training extended to churn & CLV
`pool_train_rows()` (already used by credit) now also pools older-cutoff rows into
the **train split only** for churn and CLV; validation/test stay at the latest
cutoff and held-out acc_ids are dropped from the pooled rows, so split
contamination remains impossible. This raises effective N — the single biggest
lever on quality at this data size.

- Churn/credit use frame features+labels directly → pooling is leakage-safe.
- CLV: the Tweedie/Hurdle candidates learn from the extra `(features@t,
  revenue@t)` pairs; BG-NBD collapses duplicate acc_ids (fits RFM at the primary
  cutoff, never sees post-cutoff labels) so pooling is at worst neutral for it.
  Champion selection stays on the primary-cutoff validation split.

### 4.4 Churn CV → StratifiedGroupKFold(acc_id)
Because panel pooling puts the same customer in multiple train rows, plain
StratifiedKFold would let a customer span a train and a held-out fold, inflating
CV PR-AUC and the OOF-fitted calibrator. `_cv_oof` now groups by `acc_id`
(verified: a customer never spans folds). Final test/backtest metrics — what the
gate decides on — were already clean.

### 4.5 TabICL: default candidate, benchmark-only
- `TabICL` is now in `DEFAULT_CANDIDATES`, so it **always competes** and is
  visible in the candidate competition (previously opt-in via `CHURN_CANDIDATES`,
  which was never set → it never appeared). Auto-skips cleanly when the `tabicl`
  package is absent or the train set exceeds the in-context limit.
- The runner treats it as **benchmark-only**: if TabICL tops the gate, the system
  serves the best eligible **explainable** candidate (LightGBM/LR) instead.
  TabICL cannot produce per-customer SHAP, so serving it would null
  `churn_factors` for the whole population (the prediction runner degrades
  gracefully to null factors, it does not crash). It can still be pinned manually
  via the UI override if that trade-off is accepted.

### 4.6 Bug fix — `refit_for_backtest` unpacking
`_cv_oof` returns a 3-tuple `(mean, oof, fold_scores)`, but `refit_for_backtest`
unpacked two values → `ValueError: too many values to unpack`. **Implication:**
churn backtests could not have completed before this fix; the churn
backtest-based promotion checks now execute for the first time — watch the next
runs.

---

## 5. Frontend
Only one change was required: Thai labels for the three new features in
`reasoning.ts` (Customer 360 churn factors). Everything else reads feature names
and version metadata generically — no hard-coded feature lists or counts — and a
`humanizeFeature` fallback means unknown features never break the UI.

---

## 6. Senior assessment — verdict & risks

**Verdict:** the algorithm choices were already strong and appropriate for the
data (small, sparse, heavily-skewed B2B): LightGBM+calibration+SHAP for churn,
BG-NBD/Gamma-Gamma vs Tweedie vs Hurdle for zero-inflated CLV, and LightGBM
quantile + CQR + AFT for credit. The binding constraint is **data volume**, not
algorithm sophistication. The changes this cycle target exactly that (panel N,
de-noised search, a few high-value PIT features) without disturbing the
contracts.

**Residual risks / caveats**

- **Nothing here is validated by a real training run** — the sandbox has no
  DB/Docker. Validation was limited to syntax + a feature-builder smoke test +
  a StratifiedGroupKFold behavioural check. The in-pipeline **leakage suite +
  promotion gate are the safety net**: if a change introduces leakage or a
  regression, the run fails and no bad model is promoted.
- **Churn backtests run for real for the first time** (see 4.6) — observe closely.
- **CV optimism** is fixed for churn (4.4) but **credit** still uses a non-grouped
  protocol on pooled data; its tuning metric is the primary-cutoff validation
  split (clean), so impact is limited, but a grouped pass is a future refinement.
- **Feature redundancy**: `channel_hhi`/`multichannel_flag` are derived from the
  SMS/Email shares (collinear). Harmless for trees; mild variance inflation for
  the logistic baseline. Acceptable.

---

## 7. Required validation steps (cannot be done in-sandbox)

1. **Rebuild the ML image** — the `ml` service does not bind-mount source
   (`docker compose build ml`, or `up --build ml`).
2. **Run one full training run** and confirm: leakage suite green; churn
   backtests complete; TabICL appears in the candidate competition; the served
   champion is an explainable model.
3. **Verify the `tabicl` package** is in the image:
   `docker compose exec ml python -c "import tabicl; print(tabicl.__version__)"`.
4. On **real** (non-mockup) data, inspect churn SHAP to judge whether the new
   features and the email-channel features carry signal before keeping/pruning.

---

## 8. Backlog (not done this cycle)
- Credit CV → grouped protocol on pooled data (parallels 4.4).
- Move archived artifacts to R2/S3 when deployment goes multi-host (Phase 2).
- Optional: soft-delete for model versions if stronger auditability is needed.
