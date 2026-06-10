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
  const iconClass = "text-[color:var(--moby-600)]";
  const toneStyles = {
    brand: {
      accent: "bg-[color:var(--moby-600)]",
    },
    danger: {
      accent: "bg-[color:var(--danger)]",
    },
    warn: {
      accent: "bg-[color:var(--warn)]",
    },
  }[tone];

  const content = (
    <div className="flex h-full min-w-0 flex-col text-left">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className={`min-w-0 truncate text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
          {label}
        </p>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <h3 className={`num truncate text-left text-[30px] font-bold leading-none tracking-[-0.035em] text-[color:var(--ink-1)] tabular-nums ${TEXT_SAFE}`}>
          {value}
        </h3>
        <div className={`mt-4 h-px w-full ${toneStyles.accent} opacity-15`} />
      </div>

      <div className="mt-auto flex min-w-0 items-center justify-between gap-3 pt-3">
        <p className={`min-w-0 text-left text-[11px] font-normal leading-snug text-[color:var(--ink-4)] ${TEXT_SAFE}`}>
          {hint}
        </p>
        {href ? (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${iconClass}`}>
            <ArrowRight size={13} />
          </span>
        ) : null}
      </div>
    </div>
  );

  const cardClass = "block h-[148px] min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-none transition-colors";

  if (href) {
    return (
      <Link
        href={href}
        className={`${cardClass} hover:border-gray-200 hover:bg-gray-50/40`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClass}>
      {content}
    </div>
  );
}
