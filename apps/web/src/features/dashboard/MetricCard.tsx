import Link from "next/link";
import type { ElementType } from "react";
import { ArrowRight } from "lucide-react";
import { TEXT_SAFE } from "./palette";

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
  href,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  tone?: "brand" | "danger" | "warn";
  href?: string;
}) {
  const toneClass = tone === "danger"
    ? "text-[color:var(--danger)] bg-[color:var(--danger-bg)]"
    : tone === "warn"
      ? "text-[color:var(--warn)] bg-[color:var(--warn-bg)]"
      : "text-[color:var(--moby-600)] bg-[color:var(--moby-50)]";

  const content = (
    <div className="relative flex h-full min-w-0 flex-col pr-11">
      <div className={`min-w-0 text-[11px] font-normal leading-tight text-gray-600 ${TEXT_SAFE}`}>
          {label}
      </div>
      <span className={`absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-2xl ${toneClass}`}>
        <Icon size={17} />
      </span>

      <div className={`num mt-3 text-[24px] font-bold leading-none tracking-[-0.02em] text-gray-700 tabular-nums ${TEXT_SAFE}`}>
        {value}
      </div>

      <div className="mt-auto flex min-w-0 items-start justify-between gap-3 pt-5 text-[11px] font-normal text-gray-500">
        <span className={TEXT_SAFE}>{hint}</span>
        {href ? <ArrowRight size={12} className="shrink-0 text-gray-400" /> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block min-h-[96px] min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-none transition-colors hover:bg-gray-50"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="min-h-[96px] min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-none">
      {content}
    </div>
  );
}
