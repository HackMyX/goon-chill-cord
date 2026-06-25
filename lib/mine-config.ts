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
  { level: 1,  crPerHour:   550, maxStorageHours: 24, upgradeCost:   120000 },
  { level: 2,  crPerHour:   850, maxStorageHours: 24, upgradeCost:   170000 },
  { level: 3,  crPerHour:  1300, maxStorageHours: 24, upgradeCost:   280000 },
  { level: 4,  crPerHour:  2000, maxStorageHours: 24, upgradeCost:   480000 },
  { level: 5,  crPerHour:  3100, maxStorageHours: 24, upgradeCost:   800000 },
  { level: 6,  crPerHour:  4700, maxStorageHours: 24, upgradeCost:  1350000 },
  { level: 7,  crPerHour:  7000, maxStorageHours: 24, upgradeCost:  2200000 },
  { level: 8,  crPerHour: 10500, maxStorageHours: 24, upgradeCost:  3600000 },
  { level: 9,  crPerHour: 15500, maxStorageHours: 24, upgradeCost:  5800000 },
  { level: 10, crPerHour: 24000, maxStorageHours: 24, upgradeCost:  null    },
];

export const DEFAULT_MINE_CONFIG: MineConfig = {
  enabled: true,
  levels: DEFAULT_MINE_LEVELS,
  sectionTitle: "Goldmine",
  sectionSubtitle: "Passives Einkommen — upgraden und Schürfen",
};
