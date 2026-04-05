import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/board";

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Ensure profile exists
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Check if profile already exists
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // Create a default profile — household setup happens later
          await supabase.from("profiles").insert({
            id: user.id,
            display_name:
              user.user_metadata?.full_name ??
              user.email?.split("@")[0] ??
              "User",
          });
        }

        // Store Google OAuth tokens for Gmail/Calendar access
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.provider_token) {
          await supabase
            .from("profiles")
            .update({
              google_access_token: session.provider_token,
              google_refresh_token: session.provider_refresh_token ?? null,
              google_token_expiry: session.expires_at
                ? new Date(session.expires_at * 1000).toISOString()
                : null,
            })
            .eq("id", user.id);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
