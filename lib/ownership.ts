import { createServiceClient } from "./supabase";

type Owner = "partner_1" | "partner_2" | "shared";

/** Default ownership rules from the spec (used as fallback). */
const DEFAULT_RULES: Record<string, Owner> = {
  health: "partner_1",
  financial: "partner_1",
  logistics: "partner_1",
  childcare_ccs: "partner_2",
  school: "shared",
  childcare: "shared",
  activities: "shared",
  household: "shared",
  food: "shared",
  emotional: "shared",
  social: "shared",
  celebrations: "shared",
  routines: "shared",
};

/** Look up who owns a given category for a household. Falls back to defaults. */
export async function getOwner(
  householdId: string,
  category: string
): Promise<Owner> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("ownership_rules")
    .select("owner")
    .eq("household_id", householdId)
    .eq("category", category)
    .single();

  if (data?.owner) return data.owner as Owner;
  return DEFAULT_RULES[category] ?? "shared";
}

/** Seed the default ownership rules for a new household. */
export async function seedOwnershipRules(householdId: string) {
  const supabase = createServiceClient();

  const rules = Object.entries(DEFAULT_RULES).map(([category, owner]) => ({
    household_id: householdId,
    category,
    owner,
  }));

  await supabase.from("ownership_rules").upsert(rules, {
    onConflict: "household_id,category",
  });
}
