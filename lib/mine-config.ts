export interface MineLevel {
  level: number;
  crPerHour: number;
  maxStorageHours: number;
  upgradeCost: number | null;
}

export interface MineConfig {
  enabled: boolean;
  levels: MineLevel[];
  sectionTitle: string;
  sectionSubtitle: string;
}

export const DEFAULT_MINE_LEVELS: MineLevel[] = [
  { level: 1,  crPerHour: 100,  maxStorageHours: 24, upgradeCost: 500 },
  { level: 2,  crPerHour: 132,  maxStorageHours: 24, upgradeCost: 2500 },
  { level: 3,  crPerHour: 174,  maxStorageHours: 24, upgradeCost: 9300 },
  { level: 4,  crPerHour: 229,  maxStorageHours: 24, upgradeCost: 25000 },
  { level: 5,  crPerHour: 302,  maxStorageHours: 24, upgradeCost: 75000 },
  { level: 6,  crPerHour: 398,  maxStorageHours: 24, upgradeCost: 200000 },
  { level: 7,  crPerHour: 524,  maxStorageHours: 24, upgradeCost: 500000 },
  { level: 8,  crPerHour: 691,  maxStorageHours: 24, upgradeCost: 1500000 },
  { level: 9,  crPerHour: 910,  maxStorageHours: 24, upgradeCost: 5000000 },
  { level: 10, crPerHour: 1200, maxStorageHours: 24, upgradeCost: null },
];

export const DEFAULT_MINE_CONFIG: MineConfig = {
  enabled: true,
  levels: DEFAULT_MINE_LEVELS,
  sectionTitle: "Goldmine",
  sectionSubtitle: "Passives Einkommen — upgraden und Schürfen",
};
