/**
 * Metric display metadata for the Model Performance page.
 * Thai tooltip meanings come from docs/ML-V2-TRAINING-PIPELINE.md §11 —
 * the UI never computes metrics, it only explains them.
 */

export interface MetricInfo {
  label: string;
  /** Short Thai meaning (TRAINING-PIPELINE §11) — rendered as title attr. */
  tooltip: string;
  fmt: (v: number) => string;
  /** true = larger value means a better model (used for win highlighting). */
  higherIsBetter: boolean;
}

const dec3 = (v: number): string => v.toFixed(3);
const pct1 = (v: number): string => `${(v * 100).toFixed(1)}%`;
const times = (v: number): string => `${v.toFixed(2)}×`;
const int = (v: number): string => Math.round(v).toLocaleString();

export const METRIC_INFO: Record<string, MetricInfo> = {
  // ── Churn ──
  pr_auc: {
    label: "PR-AUC",
    tooltip: "คุณภาพการจับคนที่จะ churn จริงเมื่อ class เอียง — ค่าหลัก",
    fmt: dec3,
    higherIsBetter: true,
  },
  roc_auc: {
    label: "ROC-AUC",
    tooltip: "ความสามารถแยกกลุ่มโดยรวม — > 0.97 ต้องสงสัย data leak",
    fmt: dec3,
    higherIsBetter: true,
  },
  precision: {
    label: "Precision",
    tooltip: "กลุ่มที่โมเดลชี้ว่าเสี่ยง ชี้ถูกกี่ % — โทรไปไม่เก้อกี่สาย",
    fmt: pct1,
    higherIsBetter: true,
  },
  recall: {
    label: "Recall",
    tooltip: "คนที่จะ churn จริง โมเดลจับได้กี่ % — หลุดมือไปกี่คน",
    fmt: pct1,
    higherIsBetter: true,
  },
  f1: {
    label: "F1",
    tooltip: "สมดุล precision/recall ที่ threshold เดียว — ค่าขึ้นกับ threshold เสมอ",
    fmt: dec3,
    higherIsBetter: true,
  },
  recall_at_top10pct: {
    label: "Recall@top-10%",
    tooltip: "ถ้าทีมขายโทรได้แค่ 10% ของลูกค้า จะครอบ churner จริงกี่ %",
    fmt: pct1,
    higherIsBetter: true,
  },
  lift_at_top10pct: {
    label: "Lift@top-10%",
    tooltip: "top 10% ของโมเดลเจอ churner หนาแน่นกว่าสุ่มกี่เท่า — > 2.5× ถือว่าใช้งานได้",
    fmt: times,
    higherIsBetter: true,
  },
  brier: {
    label: "Brier score",
    tooltip: "ความแม่นของค่าความน่าจะเป็น — ยิ่งต่ำยิ่งดี",
    fmt: dec3,
    higherIsBetter: false,
  },
  ece: {
    label: "ECE",
    tooltip: "ความตรงของ calibration (บอก 70% แล้ว churn จริง ~70% ไหม) — เป้า < 0.05",
    fmt: dec3,
    higherIsBetter: false,
  },
  // ── CLV ──
  spearman: {
    label: "Spearman",
    tooltip: "จัดอันดับลูกค้าตามมูลค่าได้ถูกแค่ไหน — ค่าหลักของ CLV",
    fmt: dec3,
    higherIsBetter: true,
  },
  mae: {
    label: "MAE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท",
    fmt: int,
    higherIsBetter: false,
  },
  rmse: {
    label: "RMSE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท — โดน outlier ลากแรงกว่า MAE",
    fmt: int,
    higherIsBetter: false,
  },
  smape: {
    label: "SMAPE",
    tooltip: "% คลาดเคลื่อนแบบสมมาตร (กัน zero หาร) — รายงานประกอบ",
    fmt: pct1,
    higherIsBetter: false,
  },
  top_decile_capture: {
    label: "Top-decile capture",
    tooltip: "top 10% ตามโมเดล กินรายได้จริงกี่ % ของทั้งหมด — เป้า > 35%",
    fmt: pct1,
    higherIsBetter: true,
  },
  // ── Credit ──
  mae_30d: {
    label: "MAE 30d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 30 วัน (เครดิต)",
    fmt: int,
    higherIsBetter: false,
  },
  smape_30d: {
    label: "SMAPE 30d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 30 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  mae_90d: {
    label: "MAE 90d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 90 วัน (เครดิต)",
    fmt: int,
    higherIsBetter: false,
  },
  smape_90d: {
    label: "SMAPE 90d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 90 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  coverage_p10_p90: {
    label: "Coverage p10–p90",
    tooltip: "ค่าจริงตกในช่วง p10–p90 กี่ % — ควร ≈ 80% (75–85%)",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_recall: {
    label: "Urgent recall",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนครบแค่ไหน — เป้า > 0.7",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_precision: {
    label: "Urgent precision",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนถูกแค่ไหน",
    fmt: pct1,
    higherIsBetter: true,
  },
};

/** Lookup with a safe fallback for metric keys the UI doesn't know yet. */
export function metricInfo(key: string): MetricInfo {
  return (
    METRIC_INFO[key] ?? {
      label: key,
      tooltip: key,
      fmt: (v: number) => (Math.abs(v) <= 1 ? dec3(v) : v.toLocaleString()),
      higherIsBetter: true,
    }
  );
}

export const SPLIT_ORDER = ["validation", "test", "backtest_avg"] as const;

export const SPLIT_LABELS: Record<(typeof SPLIT_ORDER)[number], string> = {
  validation: "Validation",
  test: "Test",
  backtest_avg: "Backtest avg",
};

/** "2026-06-03T11:20:00+07:00" → "3 Jun 2026" (Asia/Bangkok). */
export function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}
