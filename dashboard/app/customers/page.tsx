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
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">👥 ลูกค้าทั้งหมด</h2>
        <p className="text-sm text-slate-500 mt-1">
          {data ? `${data.total.toLocaleString()} รายการ` : "กำลังโหลด..."}
        </p>
      </div>

      {/* Filters */}
      <div className="glass p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="ค้นหา Account ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-52"
        />
        <select
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
        >
          <option value="">ทุก Risk Level</option>
          <option value="High">🔴 High</option>
          <option value="Medium">🟡 Medium</option>
          <option value="Low">🟢 Low</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
        >
          <option value="">ทุก Status</option>
          <option value="paid">Paid</option>
          <option value="trial">Trial</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
        >
          <option value="churn_probability">เรียงตาม Churn Prob.</option>
          <option value="total_amount_paid">เรียงตาม Amount Paid</option>
          <option value="days_since_last_access">เรียงตาม Days Inactive</option>
          <option value="total_payments">เรียงตาม Total Payments</option>
        </select>
        {(search || risk || status) && (
          <button
            onClick={() => { setSearch(""); setRisk(""); setStatus(""); }}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            ✕ ล้าง filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass p-5">
        {loading ? (
          <div className="text-center py-12 text-slate-500">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  {["Account ID","Status","Churn Prob.","Risk","Churned","Days Inactive","Payments","Amount Paid","Expire",""].map((h) => (
                    <th key={h} className="pb-3 pr-4 text-xs text-slate-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data?.data.map((c) => (
                  <tr key={c.acc_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-brand-500 text-xs">{c.acc_id}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === "paid" ? "bg-blue-500/20 text-blue-300" : "bg-slate-700 text-slate-400"
                      }`}>{c.status}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.churn_probability * 100).toFixed(0)}%`,
                              background: c.churn_probability >= 0.6 ? "#ef4444" : c.churn_probability >= 0.3 ? "#f59e0b" : "#10b981",
                            }}
                          />
                        </div>
                        <span className="font-mono text-xs" style={{
                          color: c.churn_probability >= 0.6 ? "#fca5a5" : c.churn_probability >= 0.3 ? "#fcd34d" : "#6ee7b7"
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
                        ? <span className="text-red-400">✓ Churned</span>
                        : <span className="text-emerald-400">Active</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 font-mono text-xs">{c.days_since_last_access?.toLocaleString()} d</td>
                    <td className="py-2.5 pr-4 text-slate-400 text-xs">{c.total_payments ?? 0}</td>
                    <td className="py-2.5 pr-4 text-slate-400 text-xs">฿{Number(c.total_amount_paid ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">{c.expire}</td>
                    <td className="py-2.5 text-xs">
                      <Link
                        href={`/customers/${c.acc_id}`}
                        className="text-brand-500 hover:text-brand-400 hover:underline"
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
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500">
              หน้า {data.page} จาก {data.total_pages} ({data.total.toLocaleString()} รายการ)
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-300 transition-colors"
              >
                ← ก่อนหน้า
              </button>
              {Array.from({ length: Math.min(5, data.total_pages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2 + i, data.total_pages - 4 + i));
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      pageNum === page
                        ? "bg-brand-600 text-white"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={page === data.total_pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-300 transition-colors"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
