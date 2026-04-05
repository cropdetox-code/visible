"use client";

import { useEffect, useState, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface FamilyEvent {
  id: string;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
  all_day: boolean;
  location: string | null;
  category: string | null;
}

const CATEGORY_DOT: Record<string, string> = {
  health: "bg-red-400",
  financial: "bg-green-400",
  school: "bg-purple-400",
  childcare: "bg-pink-400",
  activities: "bg-orange-400",
  household: "bg-yellow-400",
};

function getWeekDays(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  // Start on Monday (1). If Sunday (0), go back 6 days.
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
}

export default function CalendarPage() {
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDays = getWeekDays(baseDate);
  const today = new Date();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const weekStart = weekDays[0].toISOString();
    const weekEnd = new Date(weekDays[6]);
    weekEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("family_events")
      .select("*")
      .gte("start_datetime", weekStart)
      .lte("start_datetime", weekEnd.toISOString())
      .order("start_datetime", { ascending: true });

    setEvents(data ?? []);
    setLoading(false);
  }, [weekDays[0].toISOString()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function shiftWeek(delta: number) {
    setBaseDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
  }

  // Month label for the header
  const monthSet = Array.from(new Set(weekDays.map((d) => MONTH_NAMES[d.getMonth()])));
  const yearSet = Array.from(new Set(weekDays.map((d) => d.getFullYear())));
  const headerMonth = monthSet.join(" / ");
  const headerYear = yearSet.join(" / ");

  return (
    <>
      <AppHeader title="Calendar" />
      <div className="px-4 py-4">
        {/* Week navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => shiftWeek(-1)}
            className="rounded-lg p-2 text-gray-500 active:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">{headerMonth}</p>
            <p className="text-xs text-gray-400">{headerYear}</p>
          </div>
          <button
            onClick={() => shiftWeek(1)}
            className="rounded-lg p-2 text-gray-500 active:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="mb-3 grid grid-cols-7 gap-1 text-center">
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-medium uppercase text-gray-400">
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday
                      ? "bg-amber-500 text-white"
                      : "text-gray-700"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Events by day */}
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-3">
            {weekDays.map((day, i) => {
              const dayEvents = events.filter((e) =>
                isSameDay(new Date(e.start_datetime), day)
              );
              if (dayEvents.length === 0) return null;
              return (
                <div key={i}>
                  <p className="mb-1.5 text-xs font-semibold uppercase text-gray-400">
                    {DAY_NAMES[i]} {day.getDate()}
                  </p>
                  <div className="space-y-1.5">
                    {dayEvents.map((event) => {
                      const dotColor =
                        CATEGORY_DOT[event.category ?? ""] ?? "bg-gray-400";
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-3"
                        >
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {event.title}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                              {event.all_day ? (
                                <span>All day</span>
                              ) : (
                                <span>{formatTime(event.start_datetime)}</span>
                              )}
                              {event.location && (
                                <span className="truncate">{event.location}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-400">No events this week</p>
              </div>
            )}
          </div>
        )}

        {/* Today button */}
        {!isSameDay(weekDays[0], getWeekDays(today)[0]) && (
          <button
            onClick={() => setBaseDate(new Date())}
            className="mt-4 w-full rounded-xl bg-amber-50 py-2.5 text-sm font-medium text-amber-700 active:bg-amber-100"
          >
            Back to this week
          </button>
        )}
      </div>
    </>
  );
}
