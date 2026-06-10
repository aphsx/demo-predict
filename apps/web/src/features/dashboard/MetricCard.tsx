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
    ? "text-rose-500"
    : tone === "warn"
      ? "text-orange-500"
      : "text-blue-500";

  const content = (
    <div className="flex h-full min-w-0 flex-col justify-between text-left">
      <div className="space-y-1">
        <div className="flex w-full min-w-0 items-start justify-between gap-3 text-left">
          <p className={`min-w-0 text-left text-[11px] font-normal leading-tight text-gray-600 ${TEXT_SAFE}`}>
            {label}
          </p>
          <Icon className={`h-[18px] w-[18px] shrink-0 ${toneClass}`} />
        </div>
        <h3 className={`num text-left text-[24px] font-bold leading-none text-gray-700 tabular-nums ${TEXT_SAFE}`}>
          {value}
        </h3>
      </div>

      <p className={`text-left text-[11px] font-normal ${toneClass} ${TEXT_SAFE}`}>
        <span className={TEXT_SAFE}>{hint}</span>
        {href ? <ArrowRight size={12} className="ml-1 inline-block align-[-2px] text-gray-400" /> : null}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-[140px] min-w-0 rounded-lg border-none bg-white p-4 text-left shadow-none transition-colors hover:bg-gray-50"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="h-[140px] min-w-0 rounded-lg border-none bg-white p-4 text-left shadow-none">
      {content}
    </div>
  );
}
