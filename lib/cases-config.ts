import { createClient } from "@/lib/supabase/server";
import { CASE_GROUPS, type CaseGroup, type CaseTier, type Rarity } from "@/lib/cases";

interface CaseTierRow {
  id: string;
  price: number;
  rarity_weights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  item_types: string[] | null;
}

function mergeTier(tier: CaseTier, override?: CaseTierRow): CaseTier {
  if (!override) return tier;
  return {
    ...tier,
    price: override.price,
    rarityWeights: override.rarity_weights,
    enabled: override.enabled,
    itemTypes: override.item_types ?? tier.itemTypes,
  };
}

/**
 * Resolves the live case configuration: DB overrides from `case_tiers`
 * (editable via /admin — price, rarity weights, enabled, and now also which
 * item types feed the pool) layered onto the code defaults in `lib/cases.ts`.
 * Falls back to the pure code defaults whenever the table/column doesn't
 * exist yet or is empty — this must never throw, since the entire
 * dashboard/case-opening flow depends on it.
 */
export async function getCaseConfig(): Promise<CaseGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_tiers")
    .select("id, price, rarity_weights, enabled, item_types");

  if (error || !data || data.length === 0) {
    return CASE_GROUPS;
  }

  const overridesById = new Map(data.map((row) => [row.id, row as CaseTierRow]));

  return CASE_GROUPS.map((group) => ({
    ...group,
    standard: mergeTier(group.standard, overridesById.get(group.standard.id)),
    premium: mergeTier(group.premium, overridesById.get(group.premium.id)),
  }));
}
