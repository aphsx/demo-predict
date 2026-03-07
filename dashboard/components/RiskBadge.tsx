import clsx from "clsx";

export function RiskBadge({ risk }: { risk: string }) {
  const r = risk?.toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
        r === "high"   && "badge-high",
        r === "medium" && "badge-medium",
        r === "low"    && "badge-low",
        !["high","medium","low"].includes(r) && "bg-slate-700 text-slate-300"
      )}
    >
      {r === "high" && "🔴 "}
      {r === "medium" && "🟡 "}
      {r === "low" && "🟢 "}
      {risk}
    </span>
  );
}
