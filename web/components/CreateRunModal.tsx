"use client";

import { useRef, useState } from "react";
import clsx from "clsx";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface Props {
  onClose: () => void;
  onCreated: (runId: number) => void;
}

type Step = "name" | "upload" | "processing";

export default function CreateRunModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [runName, setRunName] = useState("");
  const [runId, setRunId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState("");

  // Upload state
  const usersRef = useRef<HTMLInputElement>(null);
  const paymentsRef = useRef<HTMLInputElement>(null);
  const [usersUploaded, setUsersUploaded] = useState(false);
  const [paymentsUploaded, setPaymentsUploaded] = useState(false);
  const [uploading, setUploading] = useState<"users" | "payments" | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [predictionsReady, setPredictionsReady] = useState(false);

  async function handleCreateRun() {
    const name = runName.trim();
    if (!name) { setNameError("กรุณาใส่ชื่อ Run"); return; }
    setCreating(true);
    setNameError("");
    try {
      const res = await fetch(`${API}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const run = await res.json();
      setRunId(run.id);
      setStep("upload");
    } catch {
      setNameError("ไม่สามารถสร้าง Run ได้ กรุณาลองใหม่");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, type: "users" | "payments") {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(type);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/import-csv`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setUploadMsg(`✗ ${json.detail ?? "เกิดข้อผิดพลาด"}`);
      } else {
        if (type === "users") setUsersUploaded(true);
        else setPaymentsUploaded(true);
        setUploadMsg(`✓ ${json.message}`);
        if (json.predictions_ready) {
          setPredictionsReady(true);
          setStep("processing");
          setTimeout(() => onCreated(runId!), 1200);
        }
      }
    } catch {
      setUploadMsg("✗ เชื่อมต่อ API ไม่ได้");
    } finally {
      setUploading(null);
      if (usersRef.current) usersRef.current.value = "";
      if (paymentsRef.current) paymentsRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">สร้าง Prediction Run ใหม่</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        {step !== "processing" && (
          <div className="flex items-center gap-3 px-6 pt-5">
            <div className="flex items-center gap-2">
              <div className={clsx(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                step === "name" ? "bg-[#005AE2] text-white" : "bg-green-500 text-white"
              )}>
                {step === "name" ? "1" : "✓"}
              </div>
              <span className={clsx("text-xs font-semibold", step === "name" ? "text-[#005AE2]" : "text-green-600")}>
                ตั้งชื่อ
              </span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className={clsx(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                step === "upload" ? "bg-[#005AE2] text-white" : "bg-gray-200 text-gray-400"
              )}>
                2
              </div>
              <span className={clsx("text-xs font-semibold", step === "upload" ? "text-[#005AE2]" : "text-gray-400")}>
                อัพโหลด
              </span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-6">
          {/* Step 1: Name */}
          {step === "name" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  ชื่อ Prediction Run <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="เช่น บริษัท A มีนาคม 2026"
                  value={runName}
                  onChange={(e) => { setRunName(e.target.value); setNameError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateRun(); }}
                  className={clsx(
                    "w-full rounded-xl border px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none transition-all",
                    nameError
                      ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      : "border-gray-200 focus:border-[#005AE2] focus:ring-2 focus:ring-[#005AE2]/10"
                  )}
                />
                {nameError && <p className="mt-1.5 text-xs text-red-500">{nameError}</p>}
              </div>
              <button
                onClick={handleCreateRun}
                disabled={!runName.trim() || creating}
                className="w-full rounded-xl bg-[#005AE2] py-3 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,90,226,0.25)] hover:bg-[#004acc] disabled:opacity-40 transition-all"
              >
                {creating ? "กำลังสร้าง..." : "ถัดไป →"}
              </button>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
                <p className="text-xs font-semibold text-blue-700">Run: "{runName}"</p>
                <p className="text-[11px] text-blue-500 mt-0.5">อัพโหลดทั้ง 2 ไฟล์เพื่อเริ่ม predict</p>
              </div>

              {/* Hidden file inputs */}
              <input ref={usersRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => handleUpload(e, "users")} />
              <input ref={paymentsRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => handleUpload(e, "payments")} />

              {/* Upload zones */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => usersRef.current?.click()}
                  disabled={uploading !== null || usersUploaded}
                  className={clsx(
                    "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 transition-all",
                    usersUploaded
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 hover:border-[#005AE2]/50 hover:bg-blue-50/50"
                  )}
                >
                  {usersUploaded ? (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-green-600">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                  )}
                  <div className="text-center">
                    <p className={clsx("text-[11px] font-bold", usersUploaded ? "text-green-700" : "text-gray-600")}>
                      {uploading === "users" ? "กำลัง Import..." : usersUploaded ? "✓ Users CSV" : "Users CSV"}
                    </p>
                    {!usersUploaded && <p className="text-[10px] text-gray-400 mt-0.5">ข้อมูลลูกค้า</p>}
                  </div>
                </button>

                <button
                  onClick={() => paymentsRef.current?.click()}
                  disabled={uploading !== null || paymentsUploaded}
                  className={clsx(
                    "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 transition-all",
                    paymentsUploaded
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 hover:border-purple-400/50 hover:bg-purple-50/50"
                  )}
                >
                  {paymentsUploaded ? (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-green-600">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                  )}
                  <div className="text-center">
                    <p className={clsx("text-[11px] font-bold", paymentsUploaded ? "text-green-700" : "text-gray-600")}>
                      {uploading === "payments" ? "กำลัง Import..." : paymentsUploaded ? "✓ Payments CSV" : "Payments CSV"}
                    </p>
                    {!paymentsUploaded && <p className="text-[10px] text-gray-400 mt-0.5">ประวัติการชำระ</p>}
                  </div>
                </button>
              </div>

              {/* ── Real-time progress bar ── */}
              {uploading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-blue-700">
                      {uploading === "payments" && usersUploaded
                        ? "กำลัง Import + คำนวณ Predictions..."
                        : `กำลัง Import ${uploading === "users" ? "Users" : "Payments"} CSV...`}
                    </p>
                    <span className="text-[10px] text-blue-400 font-bold animate-pulse">●●●</span>
                  </div>
                  <div className="relative h-1.5 w-full bg-blue-50 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 w-2/5 bg-gradient-to-r from-blue-300 via-[#005AE2] to-blue-300 rounded-full"
                      style={{ animation: "bar-slide 1.2s ease-in-out infinite" }}
                    />
                  </div>
                </div>
              )}

              {uploadMsg && (
                <p className={clsx(
                  "text-[11px] text-center font-medium px-3 py-2 rounded-lg",
                  uploadMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                )}>
                  {uploadMsg}
                </p>
              )}

              <button
                onClick={onClose}
                className="w-full rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all"
              >
                ปิด (ระบบทำงานต่อใน background)
              </button>
            </div>
          )}

          {/* Processing done */}
          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7 text-green-600">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-900">Predict เสร็จแล้ว!</p>
                <p className="text-xs text-gray-500 mt-1">"{runName}" พร้อมใช้งาน</p>
              </div>
              <p className="text-xs text-gray-400">กำลังเปิดหน้าผลลัพธ์...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
