"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface Payment {
  payment_date: string;
  amount: number;
  sms_volume: number;
  product_name: string;
}

export default function PaymentLineChart({ data }: { data: Payment[] }) {
  if (!data || data.length === 0)
    return <p className="text-slate-500 text-sm text-center py-8">ไม่มีประวัติการชำระเงิน</p>;

  const chartData = data.map((d) => ({
    date: d.payment_date?.slice(0, 10),
    amount: d.amount,
    sms: d.sms_volume,
    product: d.product_name,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          formatter={(v: number, name: string) => [
            name === "amount" ? `฿${v.toLocaleString()}` : v.toLocaleString(),
            name === "amount" ? "Amount" : "SMS Volume",
          ]}
        />
        <Line type="monotone" dataKey="amount" stroke="#4f7cff" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="sms" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
