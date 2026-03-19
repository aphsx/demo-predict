import clsx from "clsx";

export function RiskBadge({ risk }: { risk: string }) {
  const r = risk?.toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
        r === "high" && "bg-[#FFF3EB] text-[#C74E00] border border-[#FFCFA0]",
        r === "medium" && "bg-[#FFFBF0] text-[#A07000] border border-[#FFE4A0]",
        r === "low" && "bg-[#EEF3FF] text-[#1243C2] border border-[#BFCFFF]",
        !["high", "medium", "low"].includes(r) && "bg-slate-100 text-slate-600 border border-slate-200"
      )}
    >
      <span className={clsx(
        "h-1.5 w-1.5 rounded-full",
        r === "high" && "bg-[#FF4D00]",
        r === "medium" && "bg-[#FFAB00]",
        r === "low" && "bg-[#0870FF]",
        !["high", "medium", "low"].includes(r) && "bg-slate-400"
      )} />
      {risk}
    </span>
  );
}
