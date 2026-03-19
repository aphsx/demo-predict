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
  const riskLabel = prob >= 0.6 ? "High Risk" : prob >= 0.3 ? "Medium Risk" : "Low Risk";

  const theme = {
    high: "#FF4D00",
    medium: "#FFAB00",
    low: "#0870FF",
    gradient: "linear-gradient(135deg, #005AE2 0%, #38BDF8 100%)"
  };

  const riskColor = prob >= 0.6 ? theme.high : prob >= 0.3 ? theme.medium : theme.low;
  const badgeColors = prob >= 0.6
    ? "bg-[#FF4D00] text-white"
    : prob >= 0.3
      ? "bg-[#FFAB00] text-white"
      : "bg-[#0870FF] text-white";

  const ltv = Number(c.ltv ?? c.total_amount_paid ?? 0);
  const initials = c.acc_id.slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all">
      <div className="flex items-center gap-6">
        {/* 1. Identity */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: theme.gradient }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-base leading-tight truncate">{c.acc_id}</h3>
            <p className="text-[11px] text-gray-500 truncate font-medium uppercase tracking-wider">{c.rfm_segment || "Standard"}</p>
          </div>
        </div>

        {/* 2. Revenue (Divider) */}
        <div className="border-l border-gray-100 pl-6 text-center">
          <p className="text-sm font-bold text-gray-900">฿{ltv.toLocaleString()}</p>
          <p className="text-[10px] font-bold text-[#5A6B8A] uppercase tracking-wider">Revenue</p>
        </div>

        {/* 3. Risk Score (Divider) */}
        <div className="border-l border-gray-100 pl-6 text-center">
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <span style={{ color: riskColor }}>
              {prob >= 0.6 ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
              ) : prob >= 0.3 ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              )}
            </span>
            <span className="text-sm font-bold text-gray-900">{(prob * 10).toFixed(1)}</span>
          </div>
          <p className="text-[10px] font-bold text-[#5A6B8A] uppercase tracking-wider whitespace-nowrap">Score</p>
        </div>

        {/* 4. Risk Badge */}
        <span className={`px-3 py-1 rounded-md text-[10px] font-bold whitespace-nowrap shadow-sm ${badgeColors}`}>
          {riskLabel.toUpperCase()}
        </span>

        {/* 5. Meta Info Group (Divider) */}
        <div className="border-l border-gray-100 pl-6 flex items-center gap-5 text-[12px] text-gray-500 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Date</span>
            <span className="text-gray-900 font-semibold">{c.expire ? String(c.expire).slice(0, 10) : "2024-02-06"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Idle</span>
            <span className="text-gray-900 font-semibold">{c.days_since_last_access}d</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Orders</span>
            <span className="text-gray-900 font-semibold">{c.total_payments ?? 0}</span>
          </div>
        </div>

        {/* 6. Action */}
        <Link
          href={`/customers/${c.acc_id}`}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 text-white text-[12px] font-bold hover:bg-black transition-colors flex-shrink-0"
        >
          View
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
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/active_run_id=(\d+)/);
    setRunId(match ? match[1] : null);
  }, []);

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
      ...(runId && { run_id: runId }),
    });
    try {
      const res = await fetch(`/api/predictions?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, search, risk, status, sortBy, runId]);

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
      ) : data?.data && data.data.length > 0 ? (
        <div className="flex flex-col gap-4">
          {data.data.map((c) => <CustomerCard key={c.acc_id} c={c} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[20px] border border-dashed border-gray-200">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">ไม่พบข้อมูลลูกค้า</p>
          <p className="text-gray-400 text-xs mt-1">ลองปรับการค้นหาหรือ Filter ใหม่</p>
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
