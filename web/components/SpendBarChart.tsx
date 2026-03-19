"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export interface SpendBarData {
  label: string;
  value: number;
}

const BAR_COLORS: Record<string, string> = {
  Active: "#005AE2",
  Churned: "#9aaabf",
};

export default function SpendBarChart({ data }: { data: SpendBarData[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barSize={56}>
        <defs>
          <linearGradient id="barActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#005AE2" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.75} />
          </linearGradient>
          <linearGradient id="barChurned" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,25,55,0.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#5A6B8A", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#9aaabf", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: "1px solid rgba(11,25,55,0.10)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(11,25,55,0.12)",
            color: "#0B1937",
          }}
          labelStyle={{ color: "#5A6B8A", fontWeight: 600 }}
          formatter={(v: number) => [`฿${v.toLocaleString()}`, "Avg Spend"]}
          cursor={{ fill: "rgba(0,90,226,0.04)" }}
        />
        <Bar dataKey="value" radius={[10, 10, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.label === "Active" ? "url(#barActive)" : "url(#barChurned)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
