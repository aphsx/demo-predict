# Customer Prioritization Segments

Practitioner spec for grouping and ranking customers for CS/sales analysis. This sits
**on top of** the ML outputs in `ml_prediction_outputs` — it consumes existing fields,
it does not add a new model. It replaces ad-hoc "champion/loyal" RFM labels with
descriptive groups that give account managers clear context about each customer's situation.

## Why not just sort by one score

`priority_score` (= log-rescaled `revenue_at_risk`) answers *"who is the most money at
risk"* — good for retention triage, but it collapses everything onto one axis. A CS team
also needs to separate *grow* from *save* from *ignore*. So we group on two axes first,
then rank inside each group.

## Inputs (all already produced per customer)

| Signal | Field | Use |
|---|---|---|
| Forward value | `predicted_clv_6m` | value tier |
| Risk | `churn_risk_level`, `churn_probability` | health |
| Engagement health | `p_alive` | health (cross-check on churn) |
| Money at risk | `revenue_at_risk` (= churn × CLV) | ranking key for retention |
| Usage trend | `usage_recent_90d` vs `usage_prev_90d` | momentum |
| Sales timing | `credit_urgency_level`, `estimated_days_until_topup` | analysis tag |
| State | `lifecycle_stage`, `sub_stage` | non-active routing |

## Axis 1 — Value tier (active customers only)

Reuses the existing `customer_value_tier` (percentile of `predicted_clv_6m` among active
customers with CLV > 0), so there is a single value-tier definition in the system:

- **high** — top 10% (pct ≥ 0.90)
- **mid** — next 40% (0.50 ≤ pct < 0.90)
- **low** — bottom 50%

"Valuable" (segments 1–3) = high **or** mid (top 50%). The 0.90 / 0.50 cuts live in
`_apply_derived`; treat them as the tunable knob.

(`total_revenue` is used only as a tie-break in ranking, not for the tier — we prioritize
forward value over past spend.)

## Axis 2 — Health (active customers only)

- **At-risk** — `churn_risk_level` ∈ {high, critical} **or** `p_alive` < 0.20
- **Watch** — `churn_risk_level` = medium **or** `p_alive` < 0.50
- **Healthy** — everything else

> The `p_alive` clause is deliberate: it catches the high-history-but-recently-dead
> customers that the churn model alone rates "low" (the 287348 pattern). Health is the
> union of churn risk **and** the alive signal, never churn alone.

## Momentum (overlay)

From `usage_recent_90d` vs `usage_prev_90d`: **growing** (> +10%), **declining** (< −10%),
**stable** otherwise.

## Segments

Mutually exclusive. Priority order top→bottom.

| # | Segment | Rule | Situation |
|---|---|---|---|
| 1 | **High-Value At-Risk** | Value A/B + At-risk | Highest money at risk |
| 2 | **Mid-Value At-Risk** | Value A/B + Watch | Slipping — watch closely |
| 3 | **High-Value Stable** | Value A/B + Healthy | Healthy high-value account |
| 4 | **Emerging** | Value C + Healthy + growing | Small but rising |
| 5 | **Stable** | Value C + Healthy + stable/declining | Low-activity, steady |
| 6 | **Low-Value Watch** | Value C + Watch | Light monitoring needed |
| 7 | **Low-Value At-Risk** | Value C + At-risk | At risk, low value |
| 8 | **Lapsed** | Churned, ever paid | Previously paying, now churned |
| 9 | **Dormant** (จำศีล) | Churned, never paid | Never converted |
| 10 | **Ghost** | Ghost / no activity | No meaningful activity |

## Analysis tags (overlay any segment)

- ⚡ **credit_urgent** — `credit_urgency_level` ∈ {critical, warning} (top-up ≤ 30 days).
  A timing signal independent of the segment; a High-Value Stable customer who is
  credit-urgent may need immediate attention.
- ↗ / ↘ — momentum, for context.

## Priority ranking (the single work-list)

1. Order by segment priority (High-Value At-Risk → … → Ghost).
2. Within each segment, sort by a money key, descending:
   - retention segments (High-Value At-Risk, Mid-Value At-Risk, Low-Value At-Risk, Low-Value Watch) → `revenue_at_risk`
   - growth/value segments (High-Value Stable, Emerging, Stable) → `predicted_clv_6m`
3. `priority_rank` = the resulting 1..N global position.

Sorting by `priority_rank` gives a team a single top-down list where the most valuable
at-risk accounts come first, then watch accounts, then stable expansion, then long-tail.

## Segment sizes on the example dataset (cutoff 2026-01-06)

| Segment | n | % | Σ forward CLV | Σ revenue-at-risk | credit-urgent |
|---|---|---|---|---|---|
| High-Value At-Risk | 648 | 2.1% | 7.0M | **4.06M** | 476 |
| Mid-Value At-Risk | 204 | 0.7% | 2.9M | 0.67M | 159 |
| High-Value Stable | 1,267 | 4.1% | 29.7M | 0.85M | 1,049 |
| Emerging | 571 | 1.9% | 0.63M | — | 137 |
| Stable | 1,041 | 3.4% | 1.1M | — | 289 |
| Low-Value Watch | 40 | 0.1% | 0.08M | 0.02M | 16 |
| Low-Value At-Risk | 462 | 1.5% | 0.89M | 0.63M | 153 |
| Lapsed | 1,935 | 6.3% | — | — | — |
| Dormant | 5,260 | 17.1% | — | — | — |
| Ghost | 19,269 | 62.8% | — | — | — |

Active = 4,233 of 30,697. The 648 **High-Value At-Risk** customers concentrate ~4.06M THB of
six-month revenue at risk — that is the list to review first.

## Integration status (wired)

Shipped in code:
- `db/init/001_schema.sql` — `ml_prediction_outputs` has `segment text`, `priority_rank integer`,
  `needs_review boolean`.
- `apps/ml/src/prediction/runner.py` — `_apply_segments` computes `segment` + global
  `priority_rank`; `needs_review` set in `_apply_derived`; all persisted in `_build_output_rows`.
- `apps/api/src/db/schema.ts` — Drizzle columns (`segment`, `priorityRank`, `needsReview`).
- `apps/api/src/lib/ml-contract.ts` + `routes/prediction-runs.ts` — fields in `PredictionOutput`,
  exposed in the outputs mapper, `priority_rank` added to the sort whitelist.

Thresholds (0.80/0.50 value cuts, p_alive 0.20/0.50, momentum ±10%) are the tunable knobs.
Reference implementation: `docs/segmentation.py`.
