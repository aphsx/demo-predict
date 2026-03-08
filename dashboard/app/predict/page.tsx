"use client";
import { useState } from "react";
import { RiskBadge } from "@/components/RiskBadge";

interface PredictResult {
  churn_probability: number;
  churn_predicted: number;
  risk: string;
  model?: string;
}

const defaultForm = {
  status: "paid",
  credit: "SMS",
  expire: "2025-06-01",
  join_date: "2024-01-01",
  last_access: "2024-12-01",
  last_send: "2024-11-15",
  total_payments: 0,
  total_amount_paid: 0,
  avg_amount_per_tx: 0,
  total_sms_volume: 0,
  avg_sms_volume: 0,
  unique_products: 0,
  last_payment_recency: 999,
  avg_payment_gap_days: 0,
  last_payment_amount: 0,
  downgraded: 0,
  dominant_credit_type: "None",
};

type FormData = typeof defaultForm;

function FormField({
  label,
  name,
  type = "text",
  children,
  onChange,
  value,
}: {
  label: string;
  name: string;
  type?: string;
  children?: React.ReactNode;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          className="bg-white border border-gray-200 rounded-[10px] px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#006bff] focus:ring-1 focus:ring-[#006bff]/50"
        >
          {children}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          className="bg-white border border-gray-200 rounded-[10px] px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#006bff] focus:ring-1 focus:ring-[#006bff]/50"
        />
      )}
    </div>
  );
}

export default function PredictPage() {
  const [form, setForm] = useState<FormData>(defaultForm);
  const [rfResult, setRfResult] = useState<PredictResult | null>(null);
  const [kerasResult, setKerasResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const runPredict = async () => {
    setLoading(true);
    setError(null);
    setRfResult(null);
    setKerasResult(null);
    try {
      const body = JSON.stringify(form);
      const [rfRes, kerasRes] = await Promise.all([
        fetch("/api/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body }),
        fetch("/api/predict-keras", { method: "POST", headers: { "Content-Type": "application/json" }, body }),
      ]);

      if (rfRes.ok) setRfResult(await rfRes.json());
      if (kerasRes.ok) setKerasResult(await kerasRes.json());
      if (!rfRes.ok && !kerasRes.ok) {
        const errText = await rfRes.text();
        setError(`API Error: ${errText}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const ResultCard = ({ result, title }: { result: PredictResult; title: string }) => {
    const p = result.churn_probability;
    const pct = (p * 100).toFixed(2);
    const color = p >= 0.6 ? "text-red-600" : p >= 0.3 ? "text-amber-600" : "text-emerald-600";
    const ringColor = p >= 0.6 ? "#EF4444" : p >= 0.3 ? "#F59E0B" : "#10B981";
    const borderStyle = p >= 0.6 ? { borderLeft: "4px solid #EF4444" } : p >= 0.3 ? { borderLeft: "4px solid #F59E0B" } : { borderLeft: "4px solid #10B981" };

    return (
      <div className="glass rounded-[20px] p-6 flex flex-col items-center gap-4" style={borderStyle}>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

        {/* Gauge */}
        <div
          className="relative w-28 h-28 flex items-center justify-center rounded-full shadow-inner"
          style={{ background: `conic-gradient(${ringColor} ${p * 360}deg, #f0f0f0 0deg)` }}
        >
          <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
            <span className={`text-xl font-bold ${color}`}>{pct}%</span>
            <span className="text-[10px] text-gray-500">Churn</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <RiskBadge risk={result.risk} />
          <p className={`text-lg font-bold ${result.churn_predicted ? "text-red-600" : "text-emerald-600"}`}>
            {result.churn_predicted ? "⚠️ CHURN" : "✅ RETAIN"}
          </p>
          {result.model && <p className="text-xs text-gray-500">{result.model}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="glass glass-strong rounded-[20px] px-8 py-8">
        <div className="relative">
          <p className="section-label mb-3" style={{ color: "rgba(148,163,184,0.7)" }}>Prediction Engine</p>
          <h2 className="text-3xl font-bold text-white">Live Churn Prediction</h2>
          <p className="mt-2 text-gray-400 text-sm">
            ทดสอบ prediction แบบ real-time ด้วย Random Forest + Keras H5 Neural Network
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form */}
        <div className="xl:col-span-2 glass rounded-[20px] p-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            ข้อมูลลูกค้า (Input Features)
          </h3>

          {/* Basic info */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Account Info</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <FormField label="Status" name="status" value={form.status} onChange={handleChange}>
                <option value="paid">Paid</option>
                <option value="trial">Trial</option>
              </FormField>
              <FormField label="Credit Type" name="credit" value={form.credit} onChange={handleChange}>
                <option value="SMS">SMS</option>
                <option value="Email">Email</option>
              </FormField>
              <FormField label="Dominant Credit" name="dominant_credit_type" value={form.dominant_credit_type} onChange={handleChange}>
                <option value="SMS">SMS</option>
                <option value="Email">Email</option>
                <option value="None">None</option>
              </FormField>
              <FormField label="Expire Date" name="expire" type="date" value={form.expire} onChange={handleChange} />
              <FormField label="Join Date" name="join_date" type="date" value={form.join_date} onChange={handleChange} />
              <FormField label="Last Access" name="last_access" type="date" value={form.last_access} onChange={handleChange} />
              <FormField label="Last Send" name="last_send" type="date" value={form.last_send} onChange={handleChange} />
              <FormField label="Downgraded" name="downgraded" value={form.downgraded} onChange={handleChange}>
                <option value={0}>No</option>
                <option value={1}>Yes</option>
              </FormField>
            </div>
          </div>

          {/* Payment features */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Payment Features</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {([
                ["Total Payments", "total_payments"],
                ["Total Amount Paid (฿)", "total_amount_paid"],
                ["Avg Amount / Tx (฿)", "avg_amount_per_tx"],
                ["Total SMS Volume", "total_sms_volume"],
                ["Avg SMS Volume", "avg_sms_volume"],
                ["Unique Products", "unique_products"],
                ["Last Payment Recency (days)", "last_payment_recency"],
                ["Avg Payment Gap (days)", "avg_payment_gap_days"],
                ["Last Payment Amount (฿)", "last_payment_amount"],
              ] as [string, keyof FormData][]).map(([label, name]) => (
                <FormField key={name} label={label} name={name} type="number" value={form[name]} onChange={handleChange} />
              ))}
            </div>
          </div>

          <button
            onClick={runPredict}
            disabled={loading}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl text-sm"
          >
            {loading ? "⏳ กำลังประมวลผล..." : "🚀 Run Prediction (RF + Keras)"}
          </button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!rfResult && !kerasResult && !loading && (
            <div className="glass rounded-[20px] p-8 text-center text-gray-500">
              <p className="text-4xl mb-3">🎯</p>
              <p className="text-sm">กรอกข้อมูลลูกค้าแล้วกด</p>
              <p className="text-sm font-semibold">"Run Prediction"</p>
              <p className="text-xs mt-2">ระบบจะใช้ทั้ง Random Forest<br />และ Keras Neural Network H5</p>
            </div>
          )}
          {loading && (
            <div className="glass rounded-[20px] p-8 text-center text-gray-500">
              <div className="animate-spin text-4xl mb-3">⚙️</div>
              <p className="text-sm">Running models...</p>
            </div>
          )}
          {rfResult && (
            <ResultCard result={rfResult} title="🌲 Random Forest (.pkl)" />
          )}
          {kerasResult && (
            <ResultCard result={kerasResult} title="🧠 Keras Neural Net (.h5)" />
          )}

          {rfResult && kerasResult && (
            <div className="glass rounded-[20px] p-4 text-center">
              <p className="text-xs text-gray-500 mb-2">Model Agreement</p>
              {rfResult.churn_predicted === kerasResult.churn_predicted ? (
                <p className="text-emerald-600 text-sm font-semibold">✅ ทั้ง 2 models ตรงกัน</p>
              ) : (
                <p className="text-amber-600 text-sm font-semibold">⚠️ Models ไม่ตรงกัน</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                RF: {(rfResult.churn_probability * 100).toFixed(1)}% ·
                Keras: {(kerasResult.churn_probability * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
