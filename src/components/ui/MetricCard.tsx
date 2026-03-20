interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  variant?: "default" | "warning" | "success" | "info";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function MetricCard({
  label,
  value,
  sub,
  variant = "default",
}: MetricCardProps) {
  const colors = {
    default: "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
    warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
    success: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
    info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
  } as const;

  return (
    <div className={cn("rounded-xl border p-4", colors[variant])}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}
