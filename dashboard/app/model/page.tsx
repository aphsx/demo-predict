const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getModelInfo() {
  const res = await fetch(`${API}/api/model-info`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function ModelPage() {
  const info = await getModelInfo();

  const features: [string, number][] = info?.feature_importance
    ? Object.entries(info.feature_importance)
    : [];
  const maxFI = features.length > 0 ? features[0][1] : 1;

  return (
    <div className="space-y-6">
      <div className="glass glass-strong rounded-[20px] px-8 py-8">
        <div className="relative">
          <p className="section-label mb-3" style={{ color: "rgba(148,163,184,0.7)" }}>AI Engine</p>
          <h2 className="text-3xl font-bold text-white">Model Information</h2>
          <p className="mt-2 text-slate-400 text-sm">
            รายละเอียด Machine Learning models ที่ใช้ในการทำนาย Churn
          </p>
        </div>
      </div>

      {!info && (
        <div className="glass p-4 text-slate-500 text-sm">ไม่สามารถโหลดข้อมูล model ได้</div>
      )}

      {info && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* sklearn model */}
          <div className="glass p-5 space-y-3">
            <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
              🌲 sklearn Pipeline (Random Forest)
            </h3>
            <div className="space-y-2 text-sm">
              {[
                ["Model Type", info.model_type],
                ["Classifier", info.classifier],
                ["N Estimators", info.n_estimators],
                ["Max Depth", info.max_depth],
                ["N Features", info.n_features],
                ["Test AUC", info.test_auc],
                ["CV AUC", info.cv_auc],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between border-b pb-2" style={{ borderColor: "rgba(11,25,55,0.07)" }}>
                  <span className="text-slate-500 text-xs">{k}</span>
                  <span className="text-navy-900 text-xs font-mono font-semibold">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Keras model */}
          <div className="glass p-5 space-y-3">
            <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
              🧠 Keras Neural Network (H5)
            </h3>
            <div className="space-y-2">
              {[
                ["File", "churn_model_keras.h5"],
                ["Architecture", "Dense(128) → BatchNorm → Dropout(0.3) → Dense(64) → BatchNorm → Dropout(0.2) → Dense(32) → Dense(1)"],
                ["Activation", "ReLU + Sigmoid output"],
                ["Optimizer", "Adam (lr=1e-3)"],
                ["Loss", "Binary Crossentropy"],
                ["Loaded", info.keras_available ? "✅ Yes" : "❌ No (TensorFlow missing)"],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex flex-col border-b pb-2" style={{ borderColor: "rgba(11,25,55,0.07)" }}>
                  <span className="text-slate-500 text-xs">{k}</span>
                  <span className="text-navy-900 text-xs font-mono mt-0.5 font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feature Importance */}
      {features.length > 0 && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-navy-900 mb-4">
            📊 Feature Importance (Random Forest)
          </h3>
          <div className="space-y-2.5">
            {features.map(([feat, imp]) => (
              <div key={feat} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-52 shrink-0 font-mono">{feat}</span>
                <div className="flex-1 h-2 bg-brand-50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(imp / maxFI) * 100}%`, background: "linear-gradient(90deg, #1461F0, #38BDF8)" }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono w-14 text-right">
                  {(imp * 100).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature list */}
      {info?.features && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-navy-900 mb-3">📋 Feature Columns (Input Order)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {info.features.map((f: string, i: number) => (
              <div key={f} className="bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-brand-400 font-mono w-5">{i + 1}.</span>
                <span className="text-xs text-navy-900 font-mono">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
