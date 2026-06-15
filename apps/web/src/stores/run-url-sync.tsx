"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRunStore } from "./run-store";

/**
 * Keeps the run store and the `?run=` query param in sync.
 * Renders nothing. Mount it on pages that use the run context
 * (must sit under a Suspense boundary — it reads useSearchParams).
 */
export function RunUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const runId = useRunStore((s) => s.runId);
  const setRunId = useRunStore((s) => s.setRunId);

  // Deep links win over the persisted value.
  useEffect(() => {
    const fromUrl = sp.get("run");
    if (fromUrl) setRunId(fromUrl);
  }, [sp, setRunId]);

  // Write the active run back into the URL (or drop a stale ?run= param).
  useEffect(() => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (!runId) {
      if (!params.has("run")) return;
      params.delete("run");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return;
    }
    if (params.get("run") !== runId) {
      params.set("run", runId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [runId, pathname, router, sp]);

  return null;
}
