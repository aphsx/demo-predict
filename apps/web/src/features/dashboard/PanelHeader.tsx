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
        <p className="type-label">
          {eyebrow}
        </p>
        <h2 className={`type-section-title mt-1 text-[20px] leading-tight ${TEXT_SAFE}`}>
          {title}
        </h2>
        <p className={`type-meta mt-1 text-[12px] font-normal leading-5 ${TEXT_SAFE}`}>{hint}</p>
      </div>
      {Icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-50 text-[color:var(--moby-600)]">
          <Icon size={16} />
        </span>
      )}
    </header>
  );
}
