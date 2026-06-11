"use client";
/**
 * Binds /customers to the active prediction run (spec §2.0/§2.2):
 * run selector → fetchRunOutputs → CustomersView. Owns loading/empty/error
 * states per spec §5 — no mock fallback when no run is completed.
 *
 * Filters are SERVER-side: stage/search/tier/risk go into the outputs query.
 * Client-side filtering of one priority-sorted page silently starved every
 * non-top-priority stage (Ghost/Churned never reached the page), so every
 * filter change refetches instead.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveRun } from "@/components/RunSelector";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchRunOutputs, type OutputsPage, type OutputsQuery } from "@/lib/mlApi";
import {
  CustomersView,
  type CustomerFilters,
  type CustomerSort,
  type CustomerSortDirection,
  type CustomerSortKey,
} from "./CustomersView";

// Server-side sort keeps the most important customers in the fetched page;
// filters are applied server-side so every lifecycle stage is reachable.
const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 300;
const FILTER_KEYS = [
  "lifecycle_stage",
  "search",
  "customer_value_tier",
  "churn_risk_level",
] as const satisfies readonly (keyof CustomerFilters)[];
const SORT_KEYS = [
  "acc_id",
  "lifecycle_stage",
  "churn_probability",
  "priority_score",
  "predicted_clv_6m",
  "total_revenue",
  "ai_status",
] as const satisfies readonly CustomerSortKey[];
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly CustomerSortDirection[];

function filtersFromSearchParams(sp: URLSearchParams): CustomerFilters {
  return {
    lifecycle_stage: sp.get("lifecycle_stage") || "",
    search: sp.get("search") || "",
    customer_value_tier: sp.get("customer_value_tier") || "",
    churn_risk_level: sp.get("churn_risk_level") || "",
  };
}

function filtersEqual(left: CustomerFilters, right: CustomerFilters) {
  return FILTER_KEYS.every((key) => left[key] === right[key]);
}

function sortFromSearchParams(sp: URLSearchParams): CustomerSort | null {
  const [key, direction] = (sp.get("sort") ?? "").split(":");
  if (
    SORT_KEYS.includes(key as CustomerSortKey) &&
    SORT_DIRECTIONS.includes(direction as CustomerSortDirection)
  ) {
    return { key: key as CustomerSortKey, direction: direction as CustomerSortDirection };
  }
  return null;
}

function sortsEqual(left: CustomerSort | null, right: CustomerSort | null) {
  return left?.key === right?.key && left?.direction === right?.direction;
}

function pageFromSearchParams(sp: URLSearchParams) {
  const page = Number(sp.get("page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function CustomersClientInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { run, runId, runs, setRunId, loading: runsLoading } = useActiveRun();
  const sp = useSearchParams();
  const requestedRunId = sp.get("run") || "";
  const effectiveRunId =
    requestedRunId && runs.some((candidate) => candidate.id === requestedRunId)
      ? requestedRunId
      : runId;
  const [filters, setFilters] = useState<CustomerFilters>(() =>
    filtersFromSearchParams(new URLSearchParams(Array.from(sp.entries())))
  );
  const [sort, setSort] = useState<CustomerSort | null>(() =>
    sortFromSearchParams(new URLSearchParams(Array.from(sp.entries())))
  );
  const [pageNumber, setPageNumber] = useState(() =>
    pageFromSearchParams(new URLSearchParams(Array.from(sp.entries())))
  );
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [page, setPage] = useState<OutputsPage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(filters.search),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    const nextFilters = filtersFromSearchParams(params);
    const nextSort = sortFromSearchParams(params);
    const nextPage = pageFromSearchParams(params);
    setFilters((current) => (filtersEqual(current, nextFilters) ? current : nextFilters));
    setSort((current) => (sortsEqual(current, nextSort) ? current : nextSort));
    setPageNumber((current) => (current === nextPage ? current : nextPage));
  }, [sp]);

  const updateFilters = (nextFilters: CustomerFilters) => {
    setFilters(nextFilters);
    setPageNumber(1);

    const params = new URLSearchParams(Array.from(sp.entries()));
    FILTER_KEYS.forEach((key) => {
      const value = nextFilters[key].trim();
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    params.delete("page");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const updateSort = (nextSort: CustomerSort | null) => {
    setSort(nextSort);
    setPageNumber(1);

    const params = new URLSearchParams(Array.from(sp.entries()));
    if (nextSort) {
      params.set("sort", `${nextSort.key}:${nextSort.direction}`);
    } else {
      params.delete("sort");
    }
    params.delete("page");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const updatePage = (nextPage: number) => {
    const safePage = Math.max(1, nextPage);
    setPageNumber(safePage);

    const params = new URLSearchParams(Array.from(sp.entries()));
    if (safePage > 1) {
      params.set("page", String(safePage));
    } else {
      params.delete("page");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (!requestedRunId || runsLoading) return;
    if (runs.some((candidate) => candidate.id === requestedRunId)) {
      setRunId(requestedRunId);
    }
  }, [requestedRunId, runs, runsLoading, setRunId]);

  useEffect(() => {
    if (!effectiveRunId) return;
    let alive = true;
    setPending(true);
    setError(null);
    fetchRunOutputs(effectiveRunId, {
      page: pageNumber,
      page_size: PAGE_SIZE,
      sort: sort ? `${sort.key}:${sort.direction}` : undefined,
      search: debouncedSearch,
      lifecycle_stage: filters.lifecycle_stage as OutputsQuery["lifecycle_stage"],
      customer_value_tier: filters.customer_value_tier as OutputsQuery["customer_value_tier"],
      churn_risk_level: filters.churn_risk_level as OutputsQuery["churn_risk_level"],
    })
      .then((result) => {
        if (!alive) return;
        const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (pageNumber > totalPages) {
          updatePage(totalPages);
          return;
        }
        setPage(result);
      })
      .catch((e: unknown) =>
        alive && setError(e instanceof Error ? e.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ")
      )
      .finally(() => alive && setPending(false));
    return () => {
      alive = false;
    };
  }, [
    effectiveRunId,
    debouncedSearch,
    filters.lifecycle_stage,
    filters.customer_value_tier,
    filters.churn_risk_level,
    pageNumber,
    sort,
  ]);

  if (!runsLoading && !run) {
    return (
      <div className="px-8 py-10">
        <EmptyState
          icon={Database}
          title="ยังไม่มี prediction run ที่เสร็จสมบูรณ์"
          hint="import ข้อมูล predict แล้วสร้าง run ก่อน — รายชื่อลูกค้าทั้งหมดมาจากผลของ run"
          action={
            <Link
              href="/runs"
              className="inline-flex h-9 items-center rounded-lg bg-[color:var(--moby-600)] px-4 text-[13px] font-medium text-white hover:bg-[color:var(--moby-700)]"
            >
              ไปหน้า Prediction Runs
            </Link>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-8 py-6">
        <EmptyState title="โหลดข้อมูลลูกค้าไม่สำเร็จ" hint={error} />
      </div>
    );
  }

  if (runsLoading || !page) {
    return (
      <div className="space-y-3 px-8 py-5">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return (
    <CustomersView
      rows={page.data}
      total={page.total}
      page={page.page}
      pageSize={page.page_size}
      pending={pending}
      runId={effectiveRunId}
      filters={filters}
      sort={sort}
      onFiltersChange={updateFilters}
      onSortChange={updateSort}
      onPageChange={updatePage}
    />
  );
}

export function CustomersClient() {
  return (
    <Suspense fallback={<div className="p-8 text-[color:var(--ink-5)]">Loading…</div>}>
      <CustomersClientInner />
    </Suspense>
  );
}
