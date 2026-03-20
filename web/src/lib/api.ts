const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // Runs
  listRuns: ()                   => req<Run[]>("/runs"),
  createRun: (body: {name:string;cutoff_date:string}) => req<Run>("/runs", {method:"POST",body:JSON.stringify(body)}),
  getRun:  (id: string)          => req<Run>(`/runs/${id}`),
  deleteRun: (id: string)        => req(`/runs/${id}`, {method:"DELETE"}),

  // Upload
  uploadFile: (runId: string, file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return fetch(`${BASE}/runs/${runId}/upload`, {method:"POST",body:fd}).then(r=>r.json());
  },

  // Predictions
  getPredictions: (runId:string, params?:Record<string,string|number>) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<PredictionsResponse>(`/runs/${runId}/predictions${qs ? "?"+qs : ""}`);
  },
  getCustomer: (runId:string, accId:number) =>
    req<Prediction>(`/runs/${runId}/predictions/${accId}`),

  // Summary
  getSummary: (runId: string) => req<Summary>(`/runs/${runId}/summary`),
};

// Types
export interface Run {
  id: string; name: string; status: string;
  cutoff_date: string; total_customers?: number;
  active_customers?: number; error_message?: string;
  created_at: string; updated_at: string;
}
export interface Prediction {
  acc_id: number;
  churn_probability: number; churn_tier: string;
  predicted_clv_6m: number; clv_ci95_lo: number; clv_ci95_hi: number;
  clv_ci80_lo: number; clv_ci80_hi: number; p_alive: number; rfm_segment: string;
  r_score?: number; f_score?: number; m_score?: number;
  credit_p10: number; credit_p25: number; credit_p50: number;
  credit_p75: number; credit_p90: number;
  urgency: string; alert_date: string;
  n_purchases: number; forecast_confidence: number;
  priority_score: number; revenue_at_risk: number; is_active: number;
  risk_factor_1?: string; risk_factor_2?: string; risk_factor_3?: string;
}
export interface PredictionsResponse {
  total: number; page: number; page_size: number; data: Prediction[];
}
export interface Summary {
  total: number; active: number; high_churn: number;
  avg_clv: number; revenue_at_risk: number; critical_topup: number;
  churn_tiers: Record<string,number>;
  rfm_segments: {rfm_segment:string;count:number}[];
  urgency_dist: Record<string,number>;
}
