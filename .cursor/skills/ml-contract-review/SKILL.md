---
name: ml-contract-review
description: Reviews ML rebuild tasks for production-quality contract functions, validation reports, point-in-time safety, and real model readiness. Use when the user asks whether an ML task is good enough, best enough, complete, ready for the next step, missing functions, missing checks, or at risk of becoming fake/demo prediction.
---

# ML Contract Review

Use this skill to review any ML rebuild task in this project before moving to the next layer.

The goal is not only to prevent errors. The goal is to ensure each task leaves behind reusable ML contract functions, reports, and verification paths that make real training and prediction possible.

## Review Stance

Ask:

- Does this task create reusable functions that the next ML layer can depend on?
- Does it produce structured evidence, not just print output?
- Does it preserve train/predict independence?
- Does it avoid fake/demo scoring or hidden heuristics pretending to be ML?
- Does it make the next task easier and safer?

Do not accept a task just because it compiles or handles exceptions.

## Required Reading

Before reviewing or extending ML work, check the relevant docs:

- `docs/ML-IMPLEMENTATION-TASKS.md`
- `docs/ML-TRAINING-SRS.md`
- `docs/ML-FEATURE-SPEC.md`
- `docs/ML-TRAINING-QUALITY-GATES.md`
- `docs/ML-EXPERIMENT-PLAN.md`
- `docs/ML-DB-REBUILD-PLAN.md`

Use the task plan for order. Do not skip ahead to training/model code if validation, labels, features, or contracts are missing.

## Contract Function Checklist

For every ML task, check whether the task should expose functions in one of these categories:

- Data access contract: load typed train/predict clean data without mixing datasets.
- Validation contract: return structured reports with blocker/warning/info checks.
- Label contract: build point-in-time labels from clean history and cutoff config.
- Feature contract: build deterministic point-in-time features and feature stats.
- Leakage contract: prove features use only pre-cutoff data.
- Schema contract: expose feature names, dtypes, defaults, allowed categories, and code hash.
- Preprocessing contract: fit only on train split; transform validation/test/predict without refit.
- Dataset contract: combine features and labels with explicit eligible populations.
- Model contract: train baseline/candidate models with saved artifacts and metadata.
- Evaluation contract: persist train/validation/test/backtest/baseline/calibration metrics.
- Prediction contract: require champion aliases and output one row per predict customer.
- Explanation contract: AI can explain outputs but never change model scores.

If a category is not relevant to the current task, say why. If it is relevant and missing, add it before moving on.

## Quality Bar

Prefer functions that:

- Accept explicit inputs and config objects.
- Return typed/structured objects or DataFrames.
- Are reusable by scripts, workers, and future tests.
- Can be verified against current DB data.
- Surface blockers as report objects, not uncaught crashes.
- Separate train and predict paths.
- Scope all training populations to known customers.
- Avoid filling invalid data with fake defaults in loader layers.
- Keep thresholds/constants visible and auditable.

Avoid:

- Ad hoc notebook-style code.
- Print-only checks.
- Hidden global defaults for cutoff, DB URL, model version, or champion alias.
- Training from predict data or prediction triggering training.
- Fake model outputs, random predictions, or rule outputs presented as ML.
- Using post-cutoff activity as features.
- Using snapshot fields like `last_send` as first-baseline core features without leakage review.

## Verification Checklist

A task is not complete until it has a verification path appropriate to its layer:

- Compile or import check for changed Python modules.
- DB smoke check when DB data is involved.
- JSON or structured report when validation/profiling is involved.
- Counts that match expected population rules.
- No failed blocker checks.
- Warnings documented as caveats for the next layer.
- Report files or DB rows are shaped for future persistence when persistence is not implemented yet.

For ML data tasks, prefer a read-only verification script that can run repeatedly.

## Review Output

When asked whether a task is good enough, answer in this shape:

```text
Verdict: ready / fix-before-next / not ready

What is solid:
- ...

Missing contract functions:
- ...

Risks or caveats:
- ...

Fixes applied or required:
- ...

Next correct task:
- ...
```

Keep the answer concise, but be strict. If something should exist for real ML readiness, call it out even if the docs only imply it.

## Project-Specific Invariants

- Use `DATABASE_URL` from env only.
- Use `train_clean_*` for training/retraining only.
- Use `predict_clean_*` for prediction only.
- Do not use the old ML pipeline.
- Do not implement fake/demo model prediction.
- Do not promote a champion without persisted evaluation evidence.
- Do not drop old ML output tables until the new training and prediction flow is verified end-to-end.
