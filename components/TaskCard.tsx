const CATEGORY_COLORS: Record<string, string> = {
  health: "bg-red-50 text-red-700",
  financial: "bg-green-50 text-green-700",
  logistics: "bg-blue-50 text-blue-700",
  school: "bg-purple-50 text-purple-700",
  childcare: "bg-pink-50 text-pink-700",
  childcare_ccs: "bg-pink-50 text-pink-700",
  activities: "bg-orange-50 text-orange-700",
  household: "bg-yellow-50 text-yellow-700",
  food: "bg-lime-50 text-lime-700",
};

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  due_date: string | null;
  is_urgent: boolean;
  created_at: string;
}

function formatDueDate(dateStr: string): string {
  // Parse as local date to avoid timezone shifts
  const [year, month, day] = dateStr.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]}`;
}

export default function TaskCard({ task }: { task: Task }) {
  const categoryClass =
    CATEGORY_COLORS[task.category ?? ""] ?? "bg-gray-50 text-gray-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        {task.is_urgent && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs text-red-600 font-bold">
            !
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{task.title}</p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.category && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryClass}`}
              >
                {task.category}
              </span>
            )}
            {task.due_date && (
              <span className="text-[10px] text-gray-400">
                Due {formatDueDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
