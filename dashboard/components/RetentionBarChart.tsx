"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  data?: { month: string; churned: number; retained: number }[];
}

export default function RetentionBarChart({ data }: Props) {
  const isDemo = !data || data.length === 0;
  const chartData = isDemo
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((m, i) => ({
      month: m,
      churned: [5, 6, 8, 7, 6, 5, 4, 5, 4][i],
      retained: [8, 10, 14, 15, 18, 19, 20, 17, 19][i],
    }))
    : data;

  return (
    <div className="relative">
      {isDemo && (
        <div className="absolute top-0 right-0 z-10 rounded-bl-lg rounded-tr-[16px] bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
          Demo Data
        </div>
      )}
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#888", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={28}
          />
          <YAxis
            tick={{ fill: "#aaa", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          <Bar dataKey="churned" name="Churned" fill="#FF4D00" radius={[3, 3, 0, 0]} barSize={14} />
          <Bar dataKey="retained" name="Retained" fill="#0870FF" radius={[3, 3, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
