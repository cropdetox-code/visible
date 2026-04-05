import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { seedOwnershipRules } from "@/lib/ownership";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/board";

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Use service client for profile/household operations (avoids RLS issues for new users)
        const serviceClient = createServiceClient();

        // Check if profile already exists
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("id, household_id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // New user — create household, profile, and ownership rules
          const displayName =
            user.user_metadata?.full_name ??
            user.email?.split("@")[0] ??
            "User";

          // Check if there's an existing household with no second partner (join flow)
          const { data: existingHousehold } = await serviceClient
            .from("households")
            .select("id")
            .limit(1)
            .single();

          let householdId: string;

          if (existingHousehold) {
            // Join existing household as partner_2
            householdId = existingHousehold.id;

            await serviceClient.from("profiles").insert({
              id: user.id,
              display_name: displayName,
              household_id: householdId,
              role: "partner_2",
            });
          } else {
            // First user — create new household
            const { data: newHousehold } = await serviceClient
              .from("households")
              .insert({ name: `${displayName}'s Family` })
              .select("id")
              .single();

            householdId = newHousehold!.id;

            await serviceClient.from("profiles").insert({
              id: user.id,
              display_name: displayName,
              household_id: householdId,
              role: "partner_1",
            });

            // Seed default ownership rules for the new household
            await seedOwnershipRules(householdId);
          }
        } else if (!profile.household_id) {
          // Existing profile with no household — fix it
          const { data: existingHousehold } = await serviceClient
            .from("households")
            .select("id")
            .limit(1)
            .single();

          if (existingHousehold) {
            await serviceClient
              .from("profiles")
              .update({ household_id: existingHousehold.id })
              .eq("id", user.id);
          } else {
            const displayName =
              user.user_metadata?.full_name ?? "Family";
            const { data: newHousehold } = await serviceClient
              .from("households")
              .insert({ name: `${displayName}'s Family` })
              .select("id")
              .single();

            if (newHousehold) {
              await serviceClient
                .from("profiles")
                .update({
                  household_id: newHousehold.id,
                  role: "partner_1",
                })
                .eq("id", user.id);
              await seedOwnershipRules(newHousehold.id);
            }
          }
        }

        // Store Google OAuth tokens for Gmail/Calendar access
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.provider_token) {
          await serviceClient
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

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
