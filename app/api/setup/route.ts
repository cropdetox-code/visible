import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { seedOwnershipRules } from "@/lib/ownership";

/**
 * One-time setup: creates the household, links existing profiles, seeds ownership rules.
 * Secured with CRON_SECRET.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Create household
  const { data: household, error: hhErr } = await supabase
    .from("households")
    .insert({ name: "Calli Family" })
    .select("id")
    .single();

  if (hhErr) {
    return NextResponse.json({ error: "Household creation failed", detail: hhErr.message }, { status: 500 });
  }

  const householdId = household.id;

  // 2. Link all existing profiles to this household
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .is("household_id", null);

  if (profiles && profiles.length > 0) {
    // Assign first profile as partner_1, rest as partner_2
    for (let i = 0; i < profiles.length; i++) {
      await supabase
        .from("profiles")
        .update({
          household_id: householdId,
          role: i === 0 ? "partner_1" : "partner_2",
        })
        .eq("id", profiles[i].id);
    }
  }

  // 3. Seed ownership rules
  await seedOwnershipRules(householdId);

  return NextResponse.json({
    success: true,
    household_id: householdId,
    profiles_linked: profiles?.map((p) => p.display_name) ?? [],
  });
}
