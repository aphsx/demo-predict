export type KnowledgeHit = {
  source: string;
  title: string;
  content: string;
  score: number;
};

const KNOWLEDGE_BASE = [
  {
    source: "internal://moby-ai/overview",
    title: "Moby AI Assistant",
    content:
      "Moby AI is an internal analytics assistant for 1Moby. It should answer in Thai by default, use real database evidence for analytics, and avoid inventing customer metrics or prediction results.",
    keywords: ["moby", "ai", "assistant", "analytics", "1moby", "ผู้ช่วย", "บริษัท"],
  },
  {
    source: "internal://metrics/churn",
    title: "Churn Risk",
    content:
      "Churn risk is represented by churn_probability from 0 to 1 and churn_risk_level as the business risk bucket. These fields live in ml_prediction_outputs after ML prediction runs are available.",
    keywords: ["churn", "risk", "เลิกใช้", "ความเสี่ยง", "churn_probability", "churn_risk_level"],
  },
  {
    source: "internal://metrics/clv",
    title: "Customer Lifetime Value",
    content:
      "Predicted six-month customer value is stored as predicted_clv_6m. Customer value segmentation is stored as customer_value_tier.",
    keywords: ["clv", "value", "มูลค่า", "predicted_clv_6m", "customer_value_tier"],
  },
  {
    source: "internal://metrics/lifecycle",
    title: "Customer Lifecycle",
    content:
      "Lifecycle stage is rule-based, not a model score. The prediction output table stores lifecycle_stage and sub_stage for each customer in a prediction run.",
    keywords: ["lifecycle", "stage", "สถานะ", "วงจร", "lifecycle_stage", "sub_stage"],
  },
  {
    source: "internal://ai/text-to-sql-safety",
    title: "Text-to-SQL Safety",
    content:
      "Text-to-SQL converts employee questions into SQL, but generated SQL must be validated before execution. The system allows SELECT only, applies row limits, blocks sensitive columns, and executes in a read-only transaction.",
    keywords: ["text-to-sql", "sql", "query", "read-only", "validator", "permission", "ถามข้อมูล"],
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function searchCompanyKnowledge(query: string, limit = 3): KnowledgeHit[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  return KNOWLEDGE_BASE.map((item) => {
    const haystack = [...item.keywords, item.title, item.content].join(" ");
    const itemTokens = new Set(tokenize(haystack));
    let score = 0;
    for (const token of queryTokens) {
      if (itemTokens.has(token)) score += 1;
    }
    return {
      source: item.source,
      title: item.title,
      content: item.content,
      score,
    };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
