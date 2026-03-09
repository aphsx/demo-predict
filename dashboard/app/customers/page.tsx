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
  ltv?: number;
  rfm_segment?: string;
  risk_factor?: string;
  recommended_action?: string;
}

interface ApiResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  data: Customer[];
}

function CustomerCard({ c }: { c: Customer }) {
  const prob = c.churn_probability;
  const risk = c.risk ?? (prob >= 0.6 ? "High" : prob >= 0.3 ? "Medium" : "Low");
  const riskScore = (prob * 10).toFixed(1);
  const riskColor = prob >= 0.6 ? "#EF4444" : prob >= 0.3 ? "#F59E0B" : "#10B981";
  const iconBg = prob >= 0.6 ? "#FEE2E2" : prob >= 0.3 ? "#FEF3C7" : "#D1FAE5";
  const ltv = Number(c.ltv ?? c.total_amount_paid ?? 0);
  const initials = c.acc_id.slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #005AE2 0%, #38BDF8 100%)" }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 font-mono text-sm leading-tight truncate">{c.acc_id}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {c.rfm_segment
                ? <span className="text-blue-600 font-medium">{c.rfm_segment}</span>
                : <span>{c.status}</span>}
            </p>
          </div>
        </div>
        {/* Revenue + Churn Risk Score */}
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-gray-900">฿{ltv.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mb-1.5">Revenue</p>
          <div className="flex items-center justify-end gap-1.5">
            <span className="p-0.5 rounded" style={{ background: iconBg, color: riskColor }}>
              {prob >= 0.6
                ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                : prob >= 0.3
                  ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              }
            </span>
            <span className="text-sm font-bold" style={{ color: riskColor }}>{riskScore}</span>
            <span className="text-xs text-gray-400">Churn Risk</span>
          </div>
        </div>
      </div>

      {/* Meta info */}
      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          Signed up:{" "}
          <span className="text-gray-700 font-medium">{c.expire ? String(c.expire).slice(0, 10) : "—"}</span>
        </span>
        <span>
          Last active:{" "}
          <span className="text-gray-700 font-medium">{c.days_since_last_access}d ago</span>
        </span>
        <span>
          Interventions:{" "}
          <span className="text-gray-700 font-medium">{c.total_payments ?? 0}</span>
        </span>
      </div>

      {c.recommended_action && c.recommended_action !== "-" && (
        <p className="mt-2 text-[11px] text-slate-400 italic line-clamp-1 leading-relaxed">
          → {c.recommended_action}
        </p>
      )}

      {/* Bottom row */}
      <div className="mt-3.5 pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
        <RiskBadge risk={risk} />
        <Link
          href={`/customers/${c.acc_id}`}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] bg-gray-900 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          View Details
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>
    </div>
  );
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
      page_size: "24",
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
  useEffect(() => { setPage(1); }, [search, risk, status, sortBy]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-7 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">Customer Intelligence</p>
            <h2 className="text-2xl font-bold text-gray-900">ลูกค้าทั้งหมด</h2>
            <p className="mt-1 text-sm text-slate-400">
              {data ? `${data.total.toLocaleString()} รายการ` : "กำลังโหลด..."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/export?sort_by=${sortBy}&order=desc${risk ? `&risk=${risk}` : ""}${status ? `&status=${status}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              download="churn_customers.csv"
              className="inline-flex items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </a>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.03)] p-4 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="ค้นหา Account ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-[10px] border border-gray-200 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 w-52"
          />
        </div>
        <select
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          className="px-3 py-2 rounded-[10px] border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        >
          <option value="">ทุก Risk Level</option>
          <option value="High">🔴 High Risk</option>
          <option value="Medium">🟡 Medium Risk</option>
          <option value="Low">🟢 Low Risk</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-[10px] border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        >
          <option value="">ทุก Status</option>
          <option value="paid">Paid</option>
          <option value="trial">Trial</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-[10px] border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        >
          <option value="churn_probability">เรียงตาม Churn Prob.</option>
          <option value="total_amount_paid">เรียงตาม Amount Paid</option>
          <option value="days_since_last_access">เรียงตาม Days Inactive</option>
          <option value="total_payments">เรียงตาม Total Payments</option>
        </select>
        {(search || risk || status) && (
          <button
            onClick={() => { setSearch(""); setRisk(""); setStatus(""); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors px-3 py-2 rounded-[10px] border border-gray-200 hover:border-red-200 hover:bg-red-50"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            ล้าง filter
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          กำลังโหลดข้อมูล...
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data?.data.map((c) => <CustomerCard key={c.acc_id} c={c} />)}
        </div>
      )}

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">
            หน้า {data.page} จาก {data.total_pages} ({data.total.toLocaleString()} รายการ)
          </p>
          <div className="flex gap-1.5">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-[8px] text-gray-600 transition-colors font-medium"
            >
              ← ก่อนหน้า
            </button>
            {Array.from({ length: Math.min(5, data.total_pages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2 + i, data.total_pages - 4 + i));
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`px-3 py-1.5 text-xs rounded-[8px] transition-colors font-medium ${pageNum === page ? "bg-gray-900 text-white" : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-600"}`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              disabled={page === data.total_pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-[8px] text-gray-600 transition-colors font-medium"
            >
              ถัดไป →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
