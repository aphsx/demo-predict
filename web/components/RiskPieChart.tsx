"use client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label,
} from "recharts";

// 1moby brand: Orange = High risk, Amber = Medium, Blue = Low (safe)
const COLORS = ["#FF4D00", "#FFAB00", "#0870FF"];

interface Props {
  high: number;
  medium: number;
  low: number;
}

export default function RiskPieChart({ high, medium, low }: Props) {
  const data = [
    { name: "High", value: high },
    { name: "Medium", value: medium },
    { name: "Low", value: low },
  ];
  const total = high + medium + low;

  return (
    <div className="flex items-center w-full" style={{ height: 220 }}>
      {/* Legend on the left */}
      <div className="flex flex-col justify-center gap-4 pl-2 pr-4" style={{ minWidth: 110 }}>
        {data.map((entry, i) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
              <div className="flex flex-col leading-tight">
                <span style={{ color: "#5A6B8A", fontSize: 12, fontWeight: 500 }}>{entry.name}</span>
                <span style={{ color: "#9aaabf", fontSize: 11 }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pie chart */}
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="46%"
            innerRadius={55}
            outerRadius={88}
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
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
