"""Side-by-side demo: current 50/30/20 score vs. value-at-risk v2.

Run:  python compare_demo.py

Uses a synthetic but realistic customer set (no DB needed) so you can see HOW
the two formulas re-rank the same customers, and where v1 is misled. Swap the
synthetic frame for a real `predictions` query to validate on live data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from priority_score_v2 import score_frame, score_frame_v1


def make_sample(n: int = 400, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    # CLV is heavy-tailed: a few whales, many small accounts (typical B2B SaaS).
    clv = np.round(rng.lognormal(mean=8.5, sigma=1.3, size=n), -1)  # ~฿hundreds..฿100k+
    churn = rng.beta(2, 5, size=n).round(3)                          # most low, some high
    days = rng.integers(1, 200, size=n).astype(float)
    days[rng.random(n) < 0.3] = np.nan                              # not everyone has a forecast
    frame = pd.DataFrame(
        {
            "acc_id": np.arange(1000, 1000 + n),
            "churn_probability": churn,
            "predicted_clv_6m": clv,
            "estimated_days_until_topup": days,
            "eligible_for_credit": rng.random(n) > 0.1,
        }
    )
    # Inject the case v1 handles worst: a whale with modest-but-real churn.
    frame.loc[0, ["churn_probability", "predicted_clv_6m", "estimated_days_until_topup"]] = [
        0.35, 480_000.0, np.nan,
    ]
    # ...and the case v1 over-ranks: tiny account, scary churn %, no value to lose.
    frame.loc[1, ["churn_probability", "predicted_clv_6m", "estimated_days_until_topup"]] = [
        0.92, 900.0, 5.0,
    ]
    return frame


def main() -> None:
    frame = make_sample()
    v1 = score_frame_v1(frame)
    v2 = score_frame(frame)

    print("=" * 78)
    print("TOP 10 by v1 (50*churn + 30*clv_rank + 20*credit)")
    print("=" * 78)
    print(
        v1.head(10)[
            ["acc_id", "priority_score_v1", "churn_probability", "predicted_clv_6m"]
        ].to_string(index=False)
    )

    print("\n" + "=" * 78)
    print("TOP 10 by v2 (value_at_risk = churn * CLV)  ←  ranked in ฿")
    print("=" * 78)
    print(
        v2.head(10)[
            ["acc_id", "value_at_risk", "priority_score", "segment", "credit_urgency"]
        ].to_string(index=False)
    )

    # How different are the two rankings?
    top20_v1 = set(v1.head(20)["acc_id"])
    top20_v2 = set(v2.head(20)["acc_id"])
    overlap = len(top20_v1 & top20_v2)
    print("\n" + "-" * 78)
    print(f"Top-20 overlap between v1 and v2: {overlap}/20 "
          f"({overlap / 20:.0%}) — the other {20 - overlap} are re-prioritised.")

    # Spotlight the two injected edge cases.
    print("\nEdge cases:")
    for acc, note in [(1000, "whale, churn 35%, CLV ฿480k"),
                      (1001, "tiny acct, churn 92%, CLV ฿900")]:
        r1 = v1.index[v1["acc_id"] == acc][0] + 1
        r2 = v2.index[v2["acc_id"] == acc][0] + 1
        var = float(v2.loc[v2["acc_id"] == acc, "value_at_risk"].iloc[0])
        print(f"  acc {acc} ({note}): v1 rank #{r1:<3} | v2 rank #{r2:<3} | "
              f"value_at_risk ฿{var:,.0f}")

    # Segment distribution — the actionable breakdown v1 cannot produce.
    print("\nSegment distribution (v2):")
    print(v2["segment"].value_counts().to_string())

    print("\nSample v2 reasons:")
    for _, row in v2.head(3).iterrows():
        print(f"  acc {row['acc_id']}: {row['priority_reason']}")


if __name__ == "__main__":
    main()
