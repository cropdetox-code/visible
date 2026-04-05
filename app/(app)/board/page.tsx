"use client";

import { useEffect, useState, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import TaskCard from "@/components/TaskCard";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  assigned_to: string;
  status: string;
  due_date: string | null;
  is_urgent: boolean;
  created_at: string;
}

const COLUMNS = [
  { key: "partner_1", label: "Lauren" },
  { key: "shared", label: "Shared" },
  { key: "partner_2", label: "Marnie" },
] as const;

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .in("status", ["todo", "in_progress"])
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false });
    setTasks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return (
    <>
      <AppHeader title="Board" />
      <div className="px-4 py-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-5">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.assigned_to === col.key);
              return (
                <section key={col.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                      {col.label}
                    </h2>
                    {colTasks.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {colTasks.length}
                      </span>
                    )}
                  </div>
                  {colTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4">
                      <p className="text-center text-sm text-gray-400">
                        No tasks
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {colTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
