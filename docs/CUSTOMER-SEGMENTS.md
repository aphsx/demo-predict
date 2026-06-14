# Customer Prioritization Segments

Practitioner spec for grouping and ranking customers for CS/sales action. This sits
**on top of** the ML outputs in `ml_prediction_outputs` — it consumes existing fields,
it does not add a new model. It replaces ad-hoc "champion/loyal" RFM labels with
action-oriented groups a team can actually run playbooks against.

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
| Sales timing | `credit_urgency_level`, `estimated_days_until_topup` | action tag |
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

| # | Segment | Rule | Play |
|---|---|---|---|
| 1 | **Protect** (รักษาด่วน) | Value A/B + At-risk | Save now — highest money at risk |
| 2 | **Stabilize** (ดึงให้นิ่ง) | Value A/B + Watch | Proactive check-in before they slip |
| 3 | **Grow** (ต่อยอด) | Value A/B + Healthy | Upsell / expansion |
| 4 | **Develop** (ปั้นดาวรุ่ง) | Value C + Healthy + growing | Small but rising — nurture to A/B |
| 5 | **Maintain** (ประคอง) | Value C + Healthy + stable/declining | Low-touch keep-warm |
| 6 | **Watch-low** (เฝ้าดูกลุ่มเล็ก) | Value C + Watch | Light monitoring |
| 7 | **Salvage-low** (เสี่ยงมูลค่าต่ำ) | Value C + At-risk | Save only if cheap — low ROI |
| 8 | **Reactivate** (ดึงกลับ) | Churned, ever paid | Win-back outreach candidate |
| 9 | **Dormant** (จำศีล) | Churned, never paid | Email nurture only |
| 10 | **Ghost** (ไม่เคยมีกิจกรรม) | Ghost / no activity | Exclude from active outreach |

## Action tags (overlay any segment)

- ⚡ **credit_urgent** — `credit_urgency_level` ∈ {critical, warning} (top-up ≤ 30 days).
  A sales trigger independent of the segment; a Grow customer who is credit-urgent is an
  expansion call *today*.
- ↗ / ↘ — momentum, for talk-track.

## Priority ranking (the single work-list)

1. Order by segment priority (Protect → … → Ghost).
2. Within each segment, sort by a money key, descending:
   - retention segments (Protect, Stabilize, Salvage-low, Watch-low) → `revenue_at_risk`
   - growth/value segments (Grow, Develop, Maintain) → `predicted_clv_6m`
3. `action_rank` = the resulting 1..N global position.

Sorting by `action_rank` gives a team a single top-down call list where the most valuable
saves come first, then proactive holds, then expansion, then long-tail.

## Segment sizes on the example dataset (cutoff 2026-01-06)

| Segment | n | % | Σ forward CLV | Σ revenue-at-risk | credit-urgent |
|---|---|---|---|---|---|
| Protect | 648 | 2.1% | 7.0M | **4.06M** | 476 |
| Stabilize | 204 | 0.7% | 2.9M | 0.67M | 159 |
| Grow | 1,267 | 4.1% | 29.7M | 0.85M | 1,049 |
| Develop | 571 | 1.9% | 0.63M | — | 137 |
| Maintain | 1,041 | 3.4% | 1.1M | — | 289 |
| Watch-low | 40 | 0.1% | 0.08M | 0.02M | 16 |
| Salvage-low | 462 | 1.5% | 0.89M | 0.63M | 153 |
| Reactivate | 1,935 | 6.3% | — | — | — |
| Dormant | 5,260 | 17.1% | — | — | — |
| Ghost | 19,269 | 62.8% | — | — | — |

Active = 4,233 of 30,697. The 648 **Protect** customers concentrate ~4.06M THB of
six-month revenue at risk — that is the list to work first.

## Integration status (wired)

Shipped in code:
- `db/init/001_schema.sql` — `ml_prediction_outputs` has `segment text`, `action_rank integer`,
  `needs_review boolean`.
- `apps/ml/src/prediction/runner.py` — `_apply_segments` computes `segment` + global
  `action_rank`; `needs_review` set in `_apply_derived`; all persisted in `_build_output_rows`.
- `apps/api/src/db/schema.ts` — Drizzle columns added (`segment`, `actionRank`, `needsReview`).
- `apps/api/src/lib/ml-contract.ts` + `routes/prediction-runs.ts` — fields in `PredictionOutput`,
  exposed in the outputs mapper, `action_rank` added to the sort whitelist.

Remaining (manual / next):
- Run `bun run db:introspect` so the generated Drizzle schema matches the new SQL, then
  `bun run build` / typecheck the API + web.
- Re-run a prediction (or retrain) to populate the new columns for existing runs.
- Web UI: show `segment` as a column/filter and `needs_review` as a badge on
  `/runs/:id/outputs` (web `PredictionOutput` type + table).

Thresholds (0.80/0.50 value cuts, p_alive 0.20/0.50, momentum ±10%) are the tunable knobs.
Reference implementation: `docs/segmentation.py`.
