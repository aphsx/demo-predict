"""Customer prioritization segments (value x health + sales-timing overlay).
Practitioner design — see CUSTOMER-SEGMENTS.md for rationale."""
import numpy as np, pandas as pd
df=pd.read_csv("/sessions/modest-laughing-darwin/mnt/outputs/repro_predictions.csv")

active = df["lifecycle_stage"].isin(["Active Paid","Active Free"])

# ---- VALUE TIER (forward CLV percentile among active, value>0) ----
clv=pd.to_numeric(df["predicted_clv_6m"],errors="coerce")
pool = active & clv.notna() & (clv>0)
pct = clv[pool].rank(pct=True)
vtier = pd.Series("-", index=df.index)
vtier.loc[pool] = np.select([pct>=0.80, pct>=0.50], ["A","B"], default="C")
df["value_tier"]=vtier

# ---- HEALTH (churn risk + p_alive) ----
risk=df["churn_risk_level"].fillna("")
pa=pd.to_numeric(df["p_alive"],errors="coerce")
health=pd.Series("-",index=df.index)
health.loc[active & (risk.isin(["high","critical"]) | (pa<0.20))] = "At-risk"
health.loc[active & (health=="-") & (risk.eq("medium") | (pa<0.50))] = "Watch"
health.loc[active & (health=="-")] = "Healthy"
df["health"]=health

# ---- USAGE MOMENTUM ----
ur=pd.to_numeric(df["usage_recent_90d"],errors="coerce").fillna(0)
up=pd.to_numeric(df["usage_prev_90d"],errors="coerce").fillna(0)
mom=np.select([ur>up*1.1, ur<up*0.9], ["growing","declining"], default="stable")
df["momentum"]=np.where(active, mom, "-")

# ---- SEGMENT ASSIGNMENT ----
def seg(r):
    st=r["lifecycle_stage"]
    if st=="Ghost": return "Ghost"
    if st=="Churned": return "Reactivate" if r["sub_stage"]=="Churned Paid" else "Dormant"
    v,h,m=r["value_tier"],r["health"],r["momentum"]
    hi = v in ("A","B")
    if hi and h=="At-risk": return "Protect"
    if hi and h=="Watch":   return "Stabilize"
    if hi and h=="Healthy": return "Grow"
    # value C
    if h=="At-risk": return "Salvage-low"
    if h=="Watch":   return "Watch-low"
    if m=="growing": return "Develop"
    return "Maintain"
df["segment"]=df.apply(seg,axis=1)

# ---- ACTION TAGS ----
df["tag_credit_urgent"]= df["credit_urgency_level"].isin(["critical","warning"])
df["tag_momentum"]=df["momentum"]

# ---- PRIORITY RANK ----
SEG_ORDER=["Protect","Stabilize","Grow","Develop","Maintain","Watch-low","Salvage-low","Reactivate","Dormant","Ghost"]
seg_rank={s:i for i,s in enumerate(SEG_ORDER)}
rar=pd.to_numeric(df["revenue_at_risk"],errors="coerce").fillna(0)
clv0=clv.fillna(0)
# money key: retention segs use revenue_at_risk; growth segs use forward CLV
money=np.where(df["segment"].isin(["Protect","Stabilize","Salvage-low","Watch-low"]), rar, clv0)
df["_segrank"]=df["segment"].map(seg_rank)
df["_money"]=money
df=df.sort_values(["_segrank","_money"],ascending=[True,False]).reset_index(drop=True)
df["action_rank"]=np.arange(1,len(df)+1)

# ---- SUMMARY ----
print("=== SEGMENT SUMMARY (n, %, total forward CLV, total revenue_at_risk) ===")
g=df.groupby("segment")
summ=pd.DataFrame({
 "n":g.size(),
 "clv_sum":g["predicted_clv_6m"].sum().round(0),
 "rev_at_risk_sum":g["revenue_at_risk"].sum().round(0),
 "credit_urgent":g["tag_credit_urgent"].sum(),
}).reindex(SEG_ORDER)
summ["%"]=(summ["n"]/len(df)*100).round(1)
print(summ.to_string())
print("\nactive customers:",int(active.sum()),"| total:",len(df))

cols=["action_rank","acc_id","segment","value_tier","health","momentum","tag_credit_urgent",
      "churn_probability","predicted_clv_6m","revenue_at_risk","p_alive",
      "estimated_days_until_topup","total_revenue","payment_count_all"]
print("\n=== TOP 15 ACTION LIST ===")
print(df[cols].head(15).round(2).to_string(index=False))

df[cols+["lifecycle_stage","predicted_credit_usage_30d","predicted_credit_usage_90d","credit_urgency_level"]]\
  .to_csv("/sessions/modest-laughing-darwin/mnt/outputs/customer_segments.csv",index=False)
print("\nsaved customer_segments.csv")
