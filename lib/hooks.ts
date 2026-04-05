"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "./supabase";

/** Fetch the current user's household_id. Returns null if not yet assigned. */
export function useHouseholdId() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("profiles")
        .select("household_id")
        .single();
      setHouseholdId(data?.household_id ?? null);
      setLoading(false);
    }
    fetch();
  }, []);

  return { householdId, loading };
}
