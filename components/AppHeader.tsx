"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AppHeader({ title }: { title: string }) {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-sm">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <button
        onClick={signOut}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100"
      >
        Sign out
      </button>
    </header>
  );
}
