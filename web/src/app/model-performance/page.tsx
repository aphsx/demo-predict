"use client";
import { useEffect, useState } from "react";
import { fetchModelMetrics, fetchTrainingLog } from "@/lib/api";

function MetricTable({ title, rows }: { title: string; rows: [string, any, string?][] }) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-2 bg-gray-50 border-b">
        <h3 className="font-semibold text-sm text-gray-800">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value, note], i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-4 py-1.5 text-gray-600 w-56">{label}</td>
              <td className="px-4 py-1.5 font-mono font-bold text-gray-900">
                {typeof value === "number"
                  ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4))
                  : String(value ?? "-")}
              </td>
              {note && <td className="px-4 py-1.5 text-xs text-gray-400">{note}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompetitionTable({ data }: { data: Record<string, any> }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="bg-white border rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-2 bg-gray-50 border-b">
        <h3 className="font-semibold text-sm text-gray-800">Model Competition (val set)</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-1.5 text-left">Model</th>
            <th className="px-4 py-1.5 text-right">AUC</th>
            <th className="px-4 py-1.5 text-right">F1</th>
            <th className="px-4 py-1.5 text-right">Precision</th>
            <th className="px-4 py-1.5 text-right">Recall</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([name, m]: [string, any], i) => (
            <tr key={name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-4 py-1.5 text-gray-800">{name}</td>
              <td className="px-4 py-1.5 text-right font-mono">{m.auc?.toFixed(4)}</td>
              <td className="px-4 py-1.5 text-right font-mono">{m.f1?.toFixed(4)}</td>
              <td className="px-4 py-1.5 text-right font-mono">{m.precision?.toFixed(4)}</td>
              <td className="px-4 py-1.5 text-right font-mono">{m.recall?.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShapTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="bg-white border rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-2 bg-gray-50 border-b">
        <h3 className="font-semibold text-sm text-gray-800">SHAP Feature Importance (top 10)</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-1.5 text-left">Feature</th>
            <th className="px-4 py-1.5 text-right">Mean |SHAP|</th>
            <th className="px-4 py-1.5 w-48">Bar</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d: any, i: number) => {
            const maxShap = data[0]?.shap || 1;
            return (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-4 py-1 font-mono text-xs text-gray-800">{d.feature}</td>
                <td className="px-4 py-1 text-right font-mono text-xs">{d.shap?.toFixed(4)}</td>
                <td className="px-4 py-1">
                  <div className="h-3 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-blue-400 rounded"
                      style={{ width: `${(d.shap / maxShap) * 100}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ModelPerformance() {
  const [metrics, setMetrics] = useState<any>(null);
  const [log, setLog] = useState<string>("");
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"metrics" | "log">("metrics");

  useEffect(() => {
    fetchModelMetrics()
      .then(setMetrics)
      .catch(() => setError("No metrics found - train models first"));
    fetchTrainingLog()
      .then((d: any) => setLog(d.log || ""))
      .catch(() => {});
  }, []);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!metrics) return <div className="p-6 text-gray-500">Loading metrics...</div>;

  const m = metrics;
  const c = m.churn || {};
  const lv = m.clv || {};
  const cr = m.credit || {};
  const wb = m.winback || {};
  const cv = m.conversion || {};
  const ds = m.data_summary || {};

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Model Performance</h1>
          <p className="text-sm text-gray-500">
            Trained: {m.generated_at?.split("T")[0] || "-"} | Cutoff: {m.cutoff_date || "-"}
          </p>
        </div>
        <div className="flex border rounded overflow-hidden text-sm">
          <button onClick={() => setTab("metrics")}
            className={`px-4 py-1.5 ${tab === "metrics" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}>
            Metrics
          </button>
          <button onClick={() => setTab("log")}
            className={`px-4 py-1.5 ${tab === "log" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}>
            Training Log
          </button>
        </div>
      </div>

      {tab === "log" && (
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
            {log || "No training log available. Run: python train.py data/your_file.xlsx"}
          </pre>
        </div>
      )}

      {tab === "metrics" && (
        <>
          {/* Data Summary */}
          <MetricTable title="Data Summary" rows={[
            ["Total users", ds.total_users],
            ["Total payments", ds.total_payments],
            ["Total usage rows", ds.total_usage_rows],
            ["Active before cutoff", ds.active_before_cutoff],
            ["Active after cutoff", ds.active_after_cutoff],
            ["Number of features", ds.n_features],
          ]} />

          {/* Churn */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <MetricTable title="1. Churn Model (LightGBM + Isotonic Calibration)" rows={[
                ["AUC-ROC", c.auc, "> 0.90 excellent"],
                ["F1 Score", c.f1, "> 0.70 good"],
                ["Precision", c.precision, "> 0.70 good"],
                ["Recall", c.recall, "> 0.70 good"],
                ["AUC without leak suspects", c.auc_without_leak_suspects],
                ["AUC drop (leakage test)", c.auc_drop_leakage_test, "< 0.05 safe"],
              ]} />
              <CompetitionTable data={m.churn_competition} />
            </div>
            <ShapTable data={m.churn_shap_top10} />
          </div>

          {/* CLV */}
          <MetricTable title="2. CLV Model (BG/NBD + Gamma-Gamma)" rows={[
            ["Spearman rank correlation", lv.spearman, "> 0.50 good"],
            ["Top decile lift", lv.top_decile_lift],
            ["MAE (baht)", lv.mae],
            ["Median AE (baht)", lv.medae],
            ["Avg P(alive)", lv.avg_p_alive],
            ["Avg CLV 6m (baht)", lv.avg_clv_6m],
            ["Median CLV 6m (baht)", lv.median_clv_6m],
            ["95% CI coverage", lv.coverage_95, "target 0.95"],
            ["80% CI coverage", lv.coverage_80, "target 0.80"],
          ]} />

          {/* Credit */}
          <MetricTable title="3. Credit Purchase Forecast (LightGBM Quantile x5)" rows={[
            ["P50 MAE (days)", cr.p50_mae],
            ["P50 Median AE (days)", cr.p50_medae],
            ["P50 R-squared", cr.p50_r2, "> 0.40 acceptable"],
            ["XGBoost baseline MAE (days)", cr.xgb_baseline_mae],
            ["P10-P90 coverage (before)", cr.coverage_p10_p90_before],
            ["P10-P90 coverage (after cal.)", cr.coverage_p10_p90_after, "target 0.80"],
            ["P25-P75 coverage (before)", cr.coverage_p25_p75_before],
            ["P25-P75 coverage (after cal.)", cr.coverage_p25_p75_after, "target 0.50"],
            ["Conformal multiplier 80%", cr.conformal_mult_80],
            ["Conformal multiplier 50%", cr.conformal_mult_50],
          ]} />

          <div className="grid grid-cols-2 gap-4">
            {/* Win-back */}
            <MetricTable title="4. Win-back Model (LightGBM + Isotonic)" rows={[
              ["AUC-ROC", wb.auc, "> 0.90 excellent"],
              ["F1 Score", wb.f1],
              ["Precision", wb.precision],
              ["Recall", wb.recall],
              ["Total churned", wb.n_churned],
              ["Actual comebacks", wb.n_comeback],
              ["Comeback rate", wb.n_comeback && wb.n_churned
                ? `${((wb.n_comeback / wb.n_churned) * 100).toFixed(1)}%` : "-"],
            ]} />

            {/* Conversion */}
            <MetricTable title="5. Conversion Model (LightGBM + Isotonic)" rows={[
              ["AUC-ROC", cv.auc, "> 0.90 excellent"],
              ["F1 Score", cv.f1],
              ["Precision", cv.precision],
              ["Recall", cv.recall],
              ["Total free users", cv.n_free],
              ["Actual conversions", cv.n_converted],
              ["Conversion rate", cv.n_converted && cv.n_free
                ? `${((cv.n_converted / cv.n_free) * 100).toFixed(1)}%` : "-"],
            ]} />
          </div>
        </>
      )}
    </div>
  );
}
