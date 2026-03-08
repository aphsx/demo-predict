"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

interface Props {
  data?: { month: string; rate: number }[];
}

/**
 * [DEMO DATA] — ข้อมูล Churn Rate รายเดือนเป็นตัวอย่าง (hardcoded)
 * ยังไม่มี API endpoint สำหรับ historical churn trends
 * ต้องสร้าง time-series data collection ก่อนจึงจะแสดงข้อมูลจริงได้
 */
export default function ChurnTrendChart({ data }: Props) {
  const isDemo = !data || data.length === 0;
  const chartData = isDemo
    ? MONTHS.map((m, i) => ({
        month: m,
        rate: [5.2, 5.8, 6.1, 4.5, 4.8, 3.9, 5.1, 4.2, 4.5][i],
      }))
    : data;

  return (
    <div className="relative">
      {isDemo && (
        <div className="absolute top-0 right-0 z-10 rounded-bl-lg rounded-tr-[16px] bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
          Demo Data
        </div>
      )}
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: "#888", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#aaa", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
          formatter={(v: number) => [`${v.toFixed(1)}%`, "Churn Rate"]}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#EF4444"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#EF4444", stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
