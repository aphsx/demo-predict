"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RiskBadge } from "@/components/RiskBadge";

const API = "";  // proxied via next.config.js

interface Customer {
  acc_id: string;
  status: string;
  credit: number;
  expire: string;
  days_since_last_access: number;
  total_payments: number;
  total_amount_paid: number;
  churn_probability: number;
  churn_predicted: number;
  risk_tier: string;
  churned: number;
  risk?: string;
}

interface ApiResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  data: Customer[];
}

export default function CustomersPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("churn_probability");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: "50",
      sort_by: sortBy,
      order: "desc",
      ...(search && { search }),
      ...(risk && { risk }),
      ...(status && { status }),
    });
    try {
      const res = await fetch(`/api/predictions?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, search, risk, status, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, risk, status, sortBy]);

  return (
    <div className="space-y-6">
      <div className="glass glass-strong rounded-[20px] px-8 py-8">
        <div className="relative">
          <p className="section-label mb-3" style={{ color: "rgba(148,163,184,0.7)" }}>Customer Intelligence</p>
          <h2 className="text-3xl font-bold text-white">ลูกค้าทั้งหมด</h2>
          <p className="mt-2 text-slate-400 text-sm">
            {data ? `${data.total.toLocaleString()} รายการ` : "กำลังโหลด..."}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass p-4 sm:p-5 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="ค้นหา Account ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-52"
        />
        <select
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">ทุก Risk Level</option>
          <option value="High">High Risk</option>
          <option value="Medium">Medium Risk</option>
          <option value="Low">Low Risk</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">ทุก Status</option>
          <option value="paid">Paid</option>
          <option value="trial">Trial</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="input-field w-auto"
        >
          <option value="churn_probability">เรียงตาม Churn Prob.</option>
          <option value="total_amount_paid">เรียงตาม Amount Paid</option>
          <option value="days_since_last_access">เรียงตาม Days Inactive</option>
          <option value="total_payments">เรียงตาม Total Payments</option>
        </select>
        {(search || risk || status) && (
          <button
            onClick={() => { setSearch(""); setRisk(""); setStatus(""); }}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors px-3 py-2 rounded-[10px] border border-gray-200 hover:border-red-200 hover:bg-red-50"
          >
            ✕ ล้าง filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass p-5 sm:p-6">
        {loading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "rgba(11,25,55,0.08)" }}>
                  {["Account ID", "Status", "Churn Prob.", "Risk", "Churned", "Days Inactive", "Payments", "Amount Paid", "Expire", ""].map((h) => (
                    <th key={h} className="pb-3 pr-4 text-[11px] font-semibold text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "rgba(11,25,55,0.05)" }}>
                {data?.data.map((c) => (
                  <tr key={c.acc_id} className="hover:bg-brand-50/40 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-brand-600 font-semibold text-xs">{c.acc_id}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${c.status === "paid"
                        ? "bg-brand-50 text-brand-600 border border-brand-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>{c.status}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.churn_probability * 100).toFixed(0)}%`,
                              background: c.churn_probability >= 0.6 ? "#EF4444" : c.churn_probability >= 0.3 ? "#F59E0B" : "#10B981",
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold" style={{
                          color: c.churn_probability >= 0.6 ? "#DC2626" : c.churn_probability >= 0.3 ? "#D97706" : "#059669"
                        }}>
                          {(c.churn_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <RiskBadge risk={c.risk ?? (c.churn_probability >= 0.6 ? "High" : c.churn_probability >= 0.3 ? "Medium" : "Low")} />
                    </td>
                    <td className="py-2.5 pr-4 text-xs">
                      {c.churned === 1
                        ? <span className="text-red-600 font-semibold">✓ Churned</span>
                        : <span className="text-emerald-600 font-semibold">Active</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 font-mono text-xs">{c.days_since_last_access?.toLocaleString()} d</td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">{c.total_payments ?? 0}</td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">฿{Number(c.total_amount_paid ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-slate-400 text-xs">{c.expire}</td>
                    <td className="py-2.5 text-xs">
                      <Link
                        href={`/customers/${c.acc_id}`}
                        className="text-brand-600 hover:text-brand-500 hover:underline font-semibold"
                      >
                        ดูรายละเอียด →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t" style={{ borderColor: "rgba(11,25,55,0.08)" }}>
            <p className="text-xs text-slate-500">
              หน้า {data.page} จาก {data.total_pages} ({data.total.toLocaleString()} รายการ)
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-600 transition-colors font-medium"
              >
                ← ก่อนหน้า
              </button>
              {Array.from({ length: Math.min(5, data.total_pages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2 + i, data.total_pages - 4 + i));
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${pageNum === page
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white border border-slate-200 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 text-slate-600"
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={page === data.total_pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-600 transition-colors font-medium"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
}
