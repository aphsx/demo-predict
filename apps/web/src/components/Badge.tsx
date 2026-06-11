const COLORS: Record<string, string> = {
  "Active Paid": "bg-blue-100 text-blue-800",
  "Active Free": "bg-purple-100 text-purple-800",
  "Churned": "bg-orange-100 text-orange-800",
  "Ghost": "bg-gray-100 text-[color:var(--ink-3)]",
  "High": "bg-red-100 text-red-800",
  "Medium": "bg-yellow-100 text-yellow-800",
  "Low": "bg-green-100 text-green-800",
  "At Risk": "bg-red-100 text-red-700",
  "Healthy": "bg-green-100 text-green-700",
  "Critical": "bg-red-100 text-red-800",
  "Warning": "bg-orange-100 text-orange-800",
  "Monitor": "bg-yellow-100 text-yellow-800",
  "Stable": "bg-green-100 text-green-800",
  "Champions": "bg-blue-100 text-blue-800",
  "Loyal": "bg-blue-50 text-blue-700",
  "Need Attention": "bg-yellow-100 text-yellow-800",
  "Free User": "bg-purple-100 text-purple-700",
  "Already Churned": "bg-gray-200 text-[color:var(--ink-2)]",
};

export default function Badge({ stage, className }: { stage: string; className?: string }) {
  const color = COLORS[stage] || "bg-gray-100 text-[color:var(--ink-3)]";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${color} ${className || ""}`}>
      {stage}
    </span>
  );
}
