"use client";
import { useEffect, useState } from "react";
import { fetchModelMetrics } from "@/lib/api";

function MetricRow({ label, value, good, warn }: { label: string; value: any; good?: string; warn?: string }) {
  const v = typeof value === "number" ? value : parseFloat(value);
  const isGood = good && v >= parseFloat(good);
  const isWarn = warn && v < parseFloat(warn);
  return (
    <tr className="border-b">
      <td className="px-3 py-2 text-sm text-gray-700">{label}</td>
      <td className={`px-3 py-2 text-sm font-mono font-bold ${isGood ? "text-green-600" : isWarn ? "text-red-600" : "text-gray-900"}`}>
        {typeof value === "number" ? value.toFixed(4) : value}
      </td>
    </tr>
  );
}

function ModelCard({ title, grade, metrics, descriptions }: any) {
  const gradeColor = grade.startsWith("A") ? "bg-green-100 text-green-800" :
    grade.startsWith("B") ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <span className={`text-sm font-bold px-2 py-0.5 rounded ${gradeColor}`}>{grade}</span>
      </div>
      <div className="p-4">
        <table className="w-full">
          <tbody>
            {descriptions.map((d: any) => (
              <MetricRow key={d.label} label={d.label} value={metrics?.[d.key] ?? "N/A"} good={d.good} warn={d.warn} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ModelPerformance() {
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchModelMetrics().then(setMetrics).catch(() => setError("No metrics found — train models first"));
  }, []);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!metrics) return <div className="p-6 text-gray-500">Loading metrics...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Model Performance</h1>
          <p className="text-sm text-gray-500">Generated: {metrics.generated_at?.split("T")[0]}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ModelCard title="1. Churn Prediction" grade="A" metrics={metrics.churn} descriptions={[
          { label: "AUC-ROC", key: "auc", good: "0.90", warn: "0.80" },
          { label: "F1 Score", key: "f1", good: "0.70", warn: "0.50" },
          { label: "Precision", key: "precision", good: "0.70", warn: "0.50" },
          { label: "Recall", key: "recall", good: "0.70", warn: "0.50" },
          { label: "Leakage AUC Drop", key: "auc_drop_leakage_test" },
        ]} />

        <ModelCard title="2. CLV (BG/NBD + Gamma-Gamma)" grade="B+" metrics={metrics.clv} descriptions={[
          { label: "Spearman Correlation", key: "spearman", good: "0.50", warn: "0.30" },
          { label: "MAE (฿)", key: "mae" },
          { label: "Median AE (฿)", key: "medae" },
          { label: "95% CI Coverage", key: "coverage_95", good: "0.90", warn: "0.80" },
          { label: "80% CI Coverage", key: "coverage_80", good: "0.75", warn: "0.60" },
          { label: "Avg P(alive)", key: "avg_p_alive" },
        ]} />

        <ModelCard title="3. Credit Purchase Forecast" grade="B-" metrics={metrics.credit} descriptions={[
          { label: "P50 MAE (days)", key: "p50_mae" },
          { label: "P50 MedAE (days)", key: "p50_medae" },
          { label: "P50 R²", key: "p50_r2", good: "0.40", warn: "0.20" },
          { label: "P10-P90 Coverage (after cal.)", key: "coverage_p10_p90_after", good: "0.75", warn: "0.60" },
          { label: "P25-P75 Coverage (after cal.)", key: "coverage_p25_p75_after", good: "0.45", warn: "0.35" },
          { label: "XGBoost Baseline MAE", key: "xgb_baseline_mae" },
        ]} />

        <ModelCard title="4. Win-back Model" grade="A-" metrics={metrics.winback} descriptions={[
          { label: "AUC-ROC", key: "auc", good: "0.90", warn: "0.80" },
          { label: "F1 Score", key: "f1" },
          { label: "Precision", key: "precision", good: "0.50", warn: "0.30" },
          { label: "Recall", key: "recall" },
          { label: "Churned Customers", key: "n_churned" },
          { label: "Actual Comebacks", key: "n_comeback" },
        ]} />

        <ModelCard title="5. Free-to-Paid Conversion" grade="A" metrics={metrics.conversion} descriptions={[
          { label: "AUC-ROC", key: "auc", good: "0.90", warn: "0.80" },
          { label: "F1 Score", key: "f1", good: "0.50", warn: "0.30" },
          { label: "Precision", key: "precision", good: "0.50", warn: "0.30" },
          { label: "Recall", key: "recall", good: "0.50", warn: "0.30" },
          { label: "Free Users", key: "n_free" },
          { label: "Actual Conversions", key: "n_converted" },
        ]} />
      </div>

      {/* Legend */}
      <div className="mt-6 bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
        <p className="font-semibold mb-2">Reading the metrics</p>
        <p><span className="text-green-600 font-bold">Green</span> = meets or exceeds benchmark.
          <span className="text-red-600 font-bold ml-2">Red</span> = below warning threshold.
          Black = informational / no benchmark.</p>
        <p className="mt-1">AUC &gt; 0.90 is excellent. F1 &gt; 0.70 is good. Coverage should be close to target (95% or 80%).</p>
      </div>
    </div>
  );
}
