"use client";
/**
 * Lightweight run-id store backed by URL query string + localStorage.
 * No external state lib — keeps deps minimal.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const KEY = "moby:lastRunId";

export function useRunStore() {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();
  const [runId, _setRunId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sp.get("run") || window.localStorage.getItem(KEY) || "";
  });

  useEffect(() => {
    if (!runId) return;
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, runId);
    // sync ?run= into URL (without scroll)
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (params.get("run") !== runId) {
      params.set("run", runId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return { runId, setRunId: _setRunId };
}
