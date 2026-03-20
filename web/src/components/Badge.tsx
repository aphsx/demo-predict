import clsx from "clsx";

const COLORS: Record<string, string> = {
  High:           "bg-red-100 text-red-800",
  Medium:         "bg-yellow-100 text-yellow-800",
  Low:            "bg-green-100 text-green-800",
  "Already Churned": "bg-gray-200 text-gray-600",
  Critical:       "bg-red-100 text-red-800",
  Warning:        "bg-orange-100 text-orange-800",
  Monitor:        "bg-yellow-100 text-yellow-800",
  Stable:         "bg-green-100 text-green-800",
  "New Customer": "bg-blue-100 text-blue-800",
  Champions:      "bg-purple-100 text-purple-800",
  Loyal:          "bg-indigo-100 text-indigo-800",
  Promising:      "bg-teal-100 text-teal-800",
  "Cannot Lose":  "bg-red-100 text-red-800",
  "At Risk":      "bg-orange-100 text-orange-800",
  "Need Attention":"bg-gray-100 text-gray-700",
  done:           "bg-green-100 text-green-800",
  processing:     "bg-blue-100 text-blue-800",
  pending:        "bg-gray-100 text-gray-600",
  failed:         "bg-red-100 text-red-800",
  validating:     "bg-yellow-100 text-yellow-800",
};

export default function Badge({ label }: { label: string }) {
  return (
    <span className={clsx(
      "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
      COLORS[label] ?? "bg-gray-100 text-gray-700"
    )}>
      {label}
    </span>
  );
}
