"use client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Label,
} from "recharts";

// 1moby brand: Orange = High risk, Amber = Medium, Blue = Low (safe)
const COLORS = ["#F56200", "#FFB020", "#1A6BFF"];

interface Props {
  high: number;
  medium: number;
  low: number;
}

function CustomLegend({ payload }: { payload?: any[] }) {
  if (!payload) return null;
  const total = payload.reduce((s: number, e: any) => s + (e.payload?.value ?? 0), 0);
  return (
    <div className="flex justify-center gap-6 mt-3">
      {payload.map((entry: any, i: number) => {
        const pct = total > 0 ? ((entry.payload.value / total) * 100).toFixed(1) : "0.0";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
            <span style={{ color: "#5A6B8A", fontSize: 12, fontWeight: 500 }}>{entry.value}</span>
            <span style={{ color: "#9aaabf", fontSize: 11 }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function RiskPieChart({ high, medium, low }: Props) {
  const data = [
    { name: "High", value: high },
    { name: "Medium", value: medium },
    { name: "Low", value: low },
  ];
  const total = high + medium + low;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="46%"
          innerRadius={65}
          outerRadius={105}
          paddingAngle={3}
          dataKey="value"
          labelLine={false}
          label={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i]} />
          ))}
          <Label
            content={({ viewBox }: any) => {
              const { cx, cy } = viewBox ?? { cx: 0, cy: 0 };
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={cx} dy="-0.45em" fontSize={22} fontWeight={700} fill="#0b0b0b">
                    {total.toLocaleString()}
                  </tspan>
                  <tspan x={cx} dy="1.5em" fontSize={11} fill="#6b6b6b" fontWeight={500}>
                    Total
                  </tspan>
                </text>
              );
            }}
            position="center"
          />
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: "1px solid rgba(11,25,55,0.10)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(11,25,55,0.12)",
            color: "#0B1937",
          }}
          labelStyle={{ color: "#5A6B8A", fontWeight: 600 }}
          formatter={(v: number, name: string) => [v.toLocaleString(), name]}
        />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
