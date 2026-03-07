"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export interface SpendBarData {
  label: string;
  value: number;
}

export default function SpendBarChart({ data }: { data: SpendBarData[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
        <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: "rgba(8, 20, 36, 0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
          }}
          formatter={(v: number) => [`฿${v.toLocaleString()}`, "Avg Spend"]}
        />
        <Bar dataKey="value" fill="url(#spendBarGradient)" radius={[10, 10, 0, 0]} />
        <defs>
          <linearGradient id="spendBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#39d4ff" />
            <stop offset="100%" stopColor="#1b82ff" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}
