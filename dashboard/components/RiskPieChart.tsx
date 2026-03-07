"use client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#EF4444", "#F59E0B", "#10B981"];

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

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={105}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(1)}%`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i]} />
          ))}
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
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: "#5A6B8A", fontSize: 12, fontWeight: 500 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
