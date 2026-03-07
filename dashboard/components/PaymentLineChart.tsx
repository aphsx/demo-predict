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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,25,55,0.07)" />
        <XAxis dataKey="date" tick={{ fill: "#9aaabf", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9aaabf", fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: "1px solid rgba(11,25,55,0.10)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(11,25,55,0.12)",
            color: "#0B1937",
          }}
          formatter={(v: number, name: string) => [
            name === "amount" ? `฿${v.toLocaleString()}` : v.toLocaleString(),
            name === "amount" ? "Amount" : "SMS Volume",
          ]}
        />
        <Line type="monotone" dataKey="amount" stroke="#1461F0" strokeWidth={2.5} dot={{ r: 3, fill: "#1461F0" }} />
        <Line type="monotone" dataKey="sms" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: "#F59E0B" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
