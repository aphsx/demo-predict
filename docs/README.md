# Documentation map

Every doc in this repo and what it answers. Start at the top.

## Start here

| Doc | What it covers | Language |
|---|---|---|
| [`../README.md`](../README.md) | Project intro, stack, how to run, ports, data flow | EN |
| [`../claude.md`](../claude.md) | **Architecture source of truth** — schema, routes, conventions, what-not-to-change | EN |

## ML v2 (canonical — follow over any legacy code)

| Doc | What it covers | Language |
|---|---|---|
| [`ML-V2-OVERVIEW.md`](ML-V2-OVERVIEW.md) | System overview, scope, build phases, current status | TH |
| [`ML-V2-DASHBOARD-SPEC.md`](ML-V2-DASHBOARD-SPEC.md) | Every web page/widget, field-by-field, value provenance | TH |
| [`ML-V2-OUTPUT-CONTRACT.md`](ML-V2-OUTPUT-CONTRACT.md) | `ml_prediction_outputs` field contract + derived-field formulas | TH |
| [`ML-V2-TRAINING-PIPELINE.md`](ML-V2-TRAINING-PIPELINE.md) | Training pipeline, anti-leakage suite, metrics, promotion gate, retraining | TH |

## Features & workflow

| Doc | What it covers | Language |
|---|---|---|
| [`AI-ASSISTANT.md`](AI-ASSISTANT.md) | AI chat assistant — architecture, governance, build plan & status | EN |
| [`WEB-DEV-WORKFLOW.md`](WEB-DEV-WORKFLOW.md) | How to run / rebuild the `apps/web` frontend during dev | TH |

## Data preparation (Excel import → clean tables)

| Doc | What it covers | Language |
|---|---|---|
| [`../moby-data-prep/README.md`](../moby-data-prep/README.md) | Data-prep overview + train-raw quick start | EN |
| [`../moby-data-prep/docs/naming-convention.md`](../moby-data-prep/docs/naming-convention.md) | Table naming: train / predict × raw / clean | EN |
| [`../moby-data-prep/docs/excel-import-contract.md`](../moby-data-prep/docs/excel-import-contract.md) | The 8-sheet Excel contract → raw tables | EN |
| [`../moby-data-prep/docs/import-fidelity-rules.md`](../moby-data-prep/docs/import-fidelity-rules.md) | What the importer does vs defers to clean | EN |
| [`../moby-data-prep/docs/raw-data-schema.md`](../moby-data-prep/docs/raw-data-schema.md) | Train raw table schema detail | EN |
| [`../moby-data-prep/docs/train-clean-schema.md`](../moby-data-prep/docs/train-clean-schema.md) | Train clean typed tables | EN |
| [`../moby-data-prep/docs/predict-clean-schema.md`](../moby-data-prep/docs/predict-clean-schema.md) | Predict clean typed tables | EN |

## Conventions

- The live database schema is **always** `db/init/001_schema.sql` — there is no migration framework.
- ML v2 docs are written in Thai by design; infrastructure docs are in English.
- If a doc disagrees with the code, the code wins — fix the doc.
