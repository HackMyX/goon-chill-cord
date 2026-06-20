/**
 * Formal equipment-slot model for the avatar. Every wardrobe `dbType`
 * resolves to exactly one of these 8 slots, which is also the strict
 * z-index paint order used by `AvatarRenderer` (lower number = further back).
 *
 * Slot-exclusivity ("equipping a new jacket unequips the old one") is
 * already enforced per `dbType` in `toggleEquip` (lib/actions/wardrobe.ts) —
 * that's strictly *finer-grained* than this slot model, since two dbTypes
 * can legitimately share a slot and stay simultaneously equipped (e.g. a
 * hat AND a hairstyle are both "Head", but a hat doesn't force the hair
 * off — they render as two independent layers). This file exists so the
 * avatar's paint order and any future slot-level UI have one canonical,
 * typed source of truth instead of magic strings scattered around.
 */
export const EQUIPMENT_SLOTS = [
  "Aura",
  "Body",
  "Face",
  "Legs",
  "Feet",
  "Head",
  "Back",
  "Weapon",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Paint order — index = z-layer, lowest first (rendered behind). */
export const SLOT_Z_ORDER: EquipmentSlot[] = [
  "Aura",
  "Body",
  "Face",
  "Legs",
  "Feet",
  "Head",
  "Back",
  "Weapon",
];

const DB_TYPE_TO_SLOT: Record<string, EquipmentSlot> = {
  aura: "Aura",
  jacket: "Body",
  shield_cosmetic: "Body",
  face: "Face",
  pants: "Legs",
  shoes: "Feet",
  hat: "Head",
  hair_m: "Head",
  hair_f: "Head",
  trail: "Back",
  weapon_cosmetic: "Weapon",
};

export function getSlotForDbType(dbType: string): EquipmentSlot | undefined {
  return DB_TYPE_TO_SLOT[dbType];
}
