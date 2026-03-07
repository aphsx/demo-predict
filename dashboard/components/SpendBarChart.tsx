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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,25,55,0.06)" />
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
        />
        <Bar dataKey="value" fill="url(#spendBarGradient)" radius={[10, 10, 0, 0]} />
        <defs>
          <linearGradient id="spendBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2B72FF" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.7} />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}
