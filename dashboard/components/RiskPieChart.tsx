"use client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#ef4444", "#f59e0b", "#10b981"];
const LABELS = ["High Risk", "Medium Risk", "Low Risk"];

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
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
