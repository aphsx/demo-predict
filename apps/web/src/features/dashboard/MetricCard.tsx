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
    <>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
            {label}
          </div>
          <div className={`num mt-1 text-[clamp(22px,5vw,26px)] font-semibold tracking-[-0.04em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
            {value}
          </div>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 items-start justify-between gap-3 text-[11.5px] text-[color:var(--ink-4)]">
        <span className={TEXT_SAFE}>{hint}</span>
        {href ? <ArrowRight size={12} className="shrink-0 text-[color:var(--ink-4)]" /> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block min-w-0 rounded-[22px] border border-[color:var(--line)] bg-white/80 px-4 py-3.5 shadow-[var(--shadow-1)] transition-colors hover:bg-[color:var(--surface-2)]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="min-w-0 rounded-[22px] border border-[color:var(--line)] bg-white/80 px-4 py-3.5 shadow-[var(--shadow-1)]">
      {content}
    </div>
  );
}
