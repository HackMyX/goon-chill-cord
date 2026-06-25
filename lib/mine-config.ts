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
  { level: 1,  crPerHour: 250,   maxStorageHours: 24, upgradeCost: 5000    },
  { level: 2,  crPerHour: 380,   maxStorageHours: 24, upgradeCost: 20000   },
  { level: 3,  crPerHour: 560,   maxStorageHours: 24, upgradeCost: 65000   },
  { level: 4,  crPerHour: 820,   maxStorageHours: 24, upgradeCost: 180000  },
  { level: 5,  crPerHour: 1200,  maxStorageHours: 24, upgradeCost: 450000  },
  { level: 6,  crPerHour: 1750,  maxStorageHours: 24, upgradeCost: 1100000 },
  { level: 7,  crPerHour: 2500,  maxStorageHours: 24, upgradeCost: 2800000 },
  { level: 8,  crPerHour: 3600,  maxStorageHours: 24, upgradeCost: 6500000 },
  { level: 9,  crPerHour: 5200,  maxStorageHours: 24, upgradeCost: 15000000},
  { level: 10, crPerHour: 7500,  maxStorageHours: 24, upgradeCost: null    },
];

export const DEFAULT_MINE_CONFIG: MineConfig = {
  enabled: true,
  levels: DEFAULT_MINE_LEVELS,
  sectionTitle: "Goldmine",
  sectionSubtitle: "Passives Einkommen — upgraden und Schürfen",
};
