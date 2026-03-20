"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Badge from "@/components/Badge";
import { api, Run } from "@/lib/api";
import { Plus, Upload, Trash2, RefreshCw, CheckCircle } from "lucide-react";

export default function RunsPage() {
  const [runs, setRuns]       = useState<Run[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName]       = useState("");
  const [cutoff, setCutoff]   = useState("2025-07-01");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const load = () => api.listRuns().then(setRuns);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const createRun = async () => {
    if (!name) return;
    await api.createRun({ name, cutoff_date: cutoff });
    setCreating(false); setName(""); load();
  };

  const deleteRun = async (id: string) => {
    if (!confirm("ลบ Run นี้?")) return;
    await api.deleteRun(id); load();
  };

  const uploadFile = async (runId: string, file: File) => {
    setUploading(runId);
    try {
      await api.uploadFile(runId, file);
      load();
    } finally {
      setUploading(null);
    }
  };

  const statusColor: Record<string,string> = {
    done:"text-green-600", processing:"text-blue-600 animate-pulse",
    failed:"text-red-600", pending:"text-gray-500", validating:"text-yellow-600",
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">จัดการ Prediction Runs</h1>
            <p className="text-sm text-gray-500">อัปโหลดข้อมูล → trigger ML pipeline</p>
          </div>
          <button onClick={() => setCreating(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
            <Plus size={16} /> สร้าง Run ใหม่
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Create form */}
          {creating && (
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
              <h2 className="font-semibold text-gray-800">Run ใหม่</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">ชื่อ Run</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                         className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                         placeholder="เช่น Q1-2025" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cutoff Date</label>
                  <input type="date" value={cutoff} onChange={e => setCutoff(e.target.value)}
                         className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={createRun}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                  สร้าง
                </button>
                <button onClick={() => setCreating(false)}
                        className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Runs table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["ชื่อ Run","Status","Cutoff","ลูกค้า","Active","สร้างเมื่อ","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{run.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {run.status === "processing" && <RefreshCw size={12} className="animate-spin text-blue-500" />}
                        {run.status === "done" && <CheckCircle size={12} className="text-green-500" />}
                        <Badge label={run.status} />
                      </div>
                      {run.error_message && (
                        <p className="text-xs text-red-500 mt-0.5 truncate max-w-xs">{run.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{run.cutoff_date}</td>
                    <td className="px-4 py-3 text-gray-600">{run.total_customers?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{run.active_customers?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(run.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Upload button */}
                        {["pending","failed"].includes(run.status) && (
                          <>
                            <button
                              onClick={() => { setSelectedRun(run.id); fileRef.current?.click(); }}
                              disabled={uploading === run.id}
                              className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-100 transition-colors disabled:opacity-50">
                              {uploading === run.id
                                ? <RefreshCw size={12} className="animate-spin" />
                                : <Upload size={12} />}
                              อัปโหลด
                            </button>
                            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
                                   onChange={e => { const f = e.target.files?.[0]; if (f && selectedRun) uploadFile(selectedRun, f); }} />
                          </>
                        )}
                        {/* View results */}
                        {run.status === "done" && (
                          <a href={`/customers?run=${run.id}`}
                             className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs hover:bg-green-100">
                            ดูผลลัพธ์
                          </a>
                        )}
                        {/* Delete */}
                        <button onClick={() => deleteRun(run.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    ยังไม่มี Run — กดปุ่ม "สร้าง Run ใหม่" เพื่อเริ่มต้น
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* How it works */}
          <div className="bg-blue-50 rounded-xl p-5 text-sm text-blue-800">
            <p className="font-semibold mb-2">ขั้นตอนการใช้งาน</p>
            <ol className="space-y-1 list-decimal list-inside text-blue-700">
              <li>กดสร้าง Run ใหม่ → กำหนดชื่อและ Cutoff Date</li>
              <li>กดอัปโหลดไฟล์ Excel ที่มีข้อมูล 1Moby</li>
              <li>ระบบ validate → insert ลงฐานข้อมูล → predict อัตโนมัติ</li>
              <li>รอ status เป็น "done" → กดดูผลลัพธ์</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}
