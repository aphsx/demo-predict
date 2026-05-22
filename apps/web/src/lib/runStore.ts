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
  const [runId, _setRunId] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = sp.get("run") || window.localStorage.getItem(KEY) || "";
    _setRunId(initial);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !runId) return;
    window.localStorage.setItem(KEY, runId);
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (params.get("run") !== runId) {
      params.set("run", runId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [runId, ready, pathname, router, sp]);

  return { runId, setRunId: _setRunId };
}
