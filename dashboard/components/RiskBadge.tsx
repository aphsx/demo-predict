import clsx from "clsx";

export function RiskBadge({ risk }: { risk: string }) {
  const r = risk?.toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
        r === "high"   && "badge-high",
        r === "medium" && "badge-medium",
        r === "low"    && "badge-low",
        !["high","medium","low"].includes(r) && "bg-slate-100 text-slate-600 border border-slate-200"
      )}
    >
      <span className={clsx(
        "h-1.5 w-1.5 rounded-full",
        r === "high"   && "bg-red-500",
        r === "medium" && "bg-amber-500",
        r === "low"    && "bg-emerald-500",
        !["high","medium","low"].includes(r) && "bg-slate-400"
      )} />
      {risk}
    </span>
  );
}
