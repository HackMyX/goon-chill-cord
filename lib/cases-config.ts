import { createClient } from "@/lib/supabase/server";
import { CASE_GROUPS, normalizeExtraDrops, type CaseGroup, type CaseTier, type CaseIconName, type Rarity } from "@/lib/cases";

interface CaseGroupDbRow {
  id: string;
  title: string;
  subtitle: string | null;
  icon_name: string;
  item_types: string[];
  display_order: number;
  enabled: boolean;
  accent_color: string | null;
  is_custom: boolean;
}

interface CaseTierDbRow {
  id: string;
  group_id: string;
  label: string;
  price: number;
  rarity_weights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  item_types: string[] | null;
  item_ids: string[] | null;
  group_label: string | null;
  group_subtitle: string | null;
  preview_cost: number | null;
  multi_open_max: number | null;
  sort_order: number | null;
  per_rarity_item_ids: Partial<Record<Rarity, string[] | null>> | null;
  name_styles_eligible: boolean | null;
  tier_sublabel: string | null;
  extra_drops: unknown;
}

function tierRowToTier(row: CaseTierDbRow, fallbackItemTypes?: string[]): CaseTier {
  return {
    id: row.id,
    label: row.label,
    sublabel: row.tier_sublabel ?? undefined,
    price: row.price,
    rarityWeights: row.rarity_weights,
    enabled: row.enabled,
    itemTypes: row.item_types ?? fallbackItemTypes,
    itemIds: row.item_ids?.length ? row.item_ids : undefined,
    perRarityItemIds: row.per_rarity_item_ids ?? undefined,
    nameStylesEligible: row.name_styles_eligible ?? false,
    extraDrops: normalizeExtraDrops(row.extra_drops),
    sortOrder: row.sort_order ?? 0,
    groupLabel: row.group_label ?? undefined,
    groupSubtitle: row.group_subtitle ?? undefined,
    previewCost: row.preview_cost ?? 0,
    multiOpenMax: Math.min(10, Math.max(2, row.multi_open_max ?? 10)),
  };
}

function buildGroupFromRows(groupRow: CaseGroupDbRow, tierRows: CaseTierDbRow[]): CaseGroup {
  const sorted = [...tierRows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const tiers = sorted.map((r) => tierRowToTier(r, groupRow.item_types));

  // Standard tier: sort_order=0 or id ends in '-standard'
  const stdRow = sorted.find((r) => r.sort_order === 0 || r.id.endsWith("-standard"));
  // Group title/subtitle may be overridden on the standard-tier row (legacy compat)
  const title = stdRow?.group_label ?? groupRow.title;
  const subtitle = stdRow?.group_subtitle ?? groupRow.subtitle ?? undefined;

  const standard = tiers[0] ?? fallbackTier(`${groupRow.id}-standard`);
  const premium  = tiers[1] ?? fallbackTier(`${groupRow.id}-premium`);

  return {
    id: groupRow.id,
    title,
    subtitle,
    iconName: (groupRow.icon_name as CaseIconName) ?? "package",
    itemTypes: groupRow.item_types ?? [],
    accentColor: groupRow.accent_color ?? undefined,
    displayOrder: groupRow.display_order,
    isCustom: groupRow.is_custom,
    tiers,
    standard,
    premium,
  };
}

function fallbackTier(id: string): CaseTier {
  return {
    id,
    label: "CASE ÖFFNEN",
    price: 5000,
    rarityWeights: { normal: 87, selten: 10, mythisch: 3, ultra: 0.1 },
    enabled: true,
    sortOrder: 0,
  };
}

/**
 * Resolves the live case configuration.
 *
 * Priority:
 *  1. Fully DB-driven: reads `case_groups` + `case_tiers` tables.
 *     Admins can create unlimited groups via Admin → Economy & Cases.
 *  2. Legacy fallback: if `case_groups` table is missing or empty,
 *     falls back to the hardcoded CASE_GROUPS merged with DB `case_tiers` overrides.
 *
 * Must never throw — the entire dashboard/case-opening flow depends on this.
 */
export async function getCaseConfig(): Promise<CaseGroup[]> {
  const supabase = await createClient();

  // ── Try fully DB-driven path ──────────────────────────────────────────────
  const { data: groupRows, error: groupError } = await supabase
    .from("case_groups")
    .select("id, title, subtitle, icon_name, item_types, display_order, enabled, accent_color, is_custom")
    .eq("enabled", true)
    .order("display_order", { ascending: true });

  if (!groupError && groupRows && groupRows.length > 0) {
    const groupIds = (groupRows as CaseGroupDbRow[]).map((g) => g.id);
    const { data: tierRows } = await supabase
      .from("case_tiers")
      .select(
        "id, group_id, label, price, rarity_weights, enabled, item_types, item_ids, group_label, group_subtitle, preview_cost, multi_open_max, sort_order, per_rarity_item_ids, name_styles_eligible, tier_sublabel, extra_drops"
      )
      .in("group_id", groupIds)
      .order("sort_order", { ascending: true });

    const byGroup = new Map<string, CaseTierDbRow[]>();
    for (const tier of (tierRows ?? []) as CaseTierDbRow[]) {
      const arr = byGroup.get(tier.group_id) ?? [];
      arr.push(tier);
      byGroup.set(tier.group_id, arr);
    }

    return (groupRows as CaseGroupDbRow[]).map((g) =>
      buildGroupFromRows(g, byGroup.get(g.id) ?? [])
    );
  }

  // ── Legacy fallback: CASE_GROUPS + case_tiers overrides ──────────────────
  const { data, error } = await supabase
    .from("case_tiers")
    .select(
      "id, group_id, label, price, rarity_weights, enabled, item_types, item_ids, group_label, group_subtitle, preview_cost, multi_open_max, sort_order, per_rarity_item_ids, name_styles_eligible, tier_sublabel"
    );

  if (error || !data || data.length === 0) {
    return CASE_GROUPS;
  }

  const overridesById = new Map((data as CaseTierDbRow[]).map((r) => [r.id, r]));

  return CASE_GROUPS.map((group) => {
    const stdOverride = overridesById.get(group.standard.id);
    const premOverride = overridesById.get(group.premium.id);

    const mergeOne = (tier: CaseTier, override?: CaseTierDbRow): CaseTier =>
      override ? tierRowToTier(override, group.itemTypes) : tier;

    const merged = {
      ...group,
      title: stdOverride?.group_label || group.title,
      subtitle: stdOverride?.group_subtitle ?? group.subtitle,
      standard: mergeOne(group.standard, stdOverride),
      premium: mergeOne(group.premium, premOverride),
    };
    merged.tiers = [merged.standard, merged.premium];
    return merged;
  });
}
