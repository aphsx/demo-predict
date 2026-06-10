import type { ElementType } from "react";
import { TEXT_SAFE } from "./palette";

export function PanelHeader({
  eyebrow,
  title,
  hint,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  icon?: ElementType;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
          {eyebrow}
        </p>
        <h2 className={`mt-1 text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
          {title}
        </h2>
        <p className={`mt-1 text-[12px] leading-5 text-[color:var(--ink-4)] ${TEXT_SAFE}`}>{hint}</p>
      </div>
      {Icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[color:var(--surface-2)] text-[color:var(--moby-700)]">
          <Icon size={16} />
        </span>
      )}
    </header>
  );
}
