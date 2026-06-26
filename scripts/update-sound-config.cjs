/**
 * Updates the sound_config DB row to include all 68 sound events.
 * Merges with existing config so custom settings are preserved.
 * Run: node scripts/update-sound-config.cjs
 */
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL not set'); process.exit(1); }

const DEFAULT_EVENTS = {
  // Interrupt
  tick:             { file: '/sounds/tick.wav',      volume: 0.18, enabled: true },
  hover:            { file: '/sounds/hover.wav',     volume: 0.10, enabled: true },
  hit:              { file: '/sounds/hit.wav',       volume: 0.28, enabled: true },
  // UI
  click:            { file: '/sounds/click.wav',     volume: 0.18, enabled: true },
  error:            { file: '/sounds/error.wav',     volume: 0.35, enabled: true },
  save:             { file: '/sounds/save.wav',      volume: 0.20, enabled: true },
  notificationPing: { file: '/sounds/tick.wav',      volume: 0.18, enabled: true },
  modalOpen:        { file: '/sounds/click.wav',     volume: 0.12, enabled: true },
  modalClose:       { file: '/sounds/click.wav',     volume: 0.10, enabled: true },
  tabSwitch:        { file: '/sounds/hover.wav',     volume: 0.12, enabled: true },
  toggleOn:         { file: '/sounds/save.wav',      volume: 0.14, enabled: true },
  toggleOff:        { file: '/sounds/hover.wav',     volume: 0.10, enabled: true },
  // Games
  win:              { file: '/sounds/win.wav',       volume: 0.35, enabled: true },
  ultraWin:         { file: '/sounds/ultra-win.wav', volume: 0.35, enabled: true },
  flip:             { file: '/sounds/flip.wav',      volume: 0.35, enabled: true },
  streakClaim:      { file: '/sounds/win.wav',       volume: 0.38, enabled: true },
  caseOpen:         { file: '/sounds/flip.wav',      volume: 0.25, enabled: true },
  caseReveal:       { file: '/sounds/ultra-win.wav', volume: 0.40, enabled: true },
  plinkoLand:       { file: '/sounds/hit.wav',       volume: 0.22, enabled: true },
  snakeEat:         { file: '/sounds/tick.wav',      volume: 0.20, enabled: true },
  snakeDie:         { file: '/sounds/error.wav',     volume: 0.28, enabled: true },
  donFlip:          { file: '/sounds/flip.wav',      volume: 0.32, enabled: true },
  // Level & XP
  levelUp:          { file: '/sounds/win.wav',       volume: 0.40, enabled: true },
  xpGain:           { file: '/sounds/tick.wav',      volume: 0.15, enabled: true },
  abilityEquip:     { file: '/sounds/save.wav',      volume: 0.25, enabled: true },
  achievementUnlock:{ file: '/sounds/win.wav',       volume: 0.42, enabled: true },
  questComplete:    { file: '/sounds/win.wav',       volume: 0.38, enabled: true },
  bpTierClaim:      { file: '/sounds/save.wav',      volume: 0.32, enabled: true },
  bpUnlock:         { file: '/sounds/ultra-win.wav', volume: 0.38, enabled: true },
  bpEliteUnlock:    { file: '/sounds/ultra-win.wav', volume: 0.42, enabled: true },
  // Shop & Economy
  purchaseSuccess:  { file: '/sounds/save.wav',      volume: 0.28, enabled: true },
  purchaseFail:     { file: '/sounds/error.wav',     volume: 0.30, enabled: true },
  shopPurchase:     { file: '/sounds/save.wav',      volume: 0.28, enabled: true },
  upgradeSuccess:   { file: '/sounds/win.wav',       volume: 0.35, enabled: true },
  itemEquip:        { file: '/sounds/save.wav',      volume: 0.25, enabled: true },
  itemUnequip:      { file: '/sounds/hover.wav',     volume: 0.15, enabled: true },
  auctionBid:       { file: '/sounds/flip.wav',      volume: 0.28, enabled: true },
  auctionWin:       { file: '/sounds/win.wav',       volume: 0.40, enabled: true },
  // World / Combat
  monsterKill:      { file: '/sounds/hit.wav',       volume: 0.22, enabled: true },
  pvpHit:           { file: '/sounds/hit.wav',       volume: 0.30, enabled: true },
  pvpKill:          { file: '/sounds/win.wav',       volume: 0.35, enabled: true },
  playerDeath:      { file: '/sounds/error.wav',     volume: 0.35, enabled: true },
  playerRespawn:    { file: '/sounds/save.wav',      volume: 0.22, enabled: true },
  mineCollect:      { file: '/sounds/tick.wav',      volume: 0.18, enabled: true },
  shieldBlock:      { file: '/sounds/hit.wav',       volume: 0.25, enabled: true },
  itemPickup:       { file: '/sounds/save.wav',      volume: 0.20, enabled: true },
  // Chat
  messageReceive:   { file: '/sounds/hover.wav',     volume: 0.12, enabled: true },
  messageSend:      { file: '/sounds/click.wav',     volume: 0.15, enabled: true },
  mentionReceive:   { file: '/sounds/win.wav',       volume: 0.30, enabled: true },
  chatPing:         { file: '/sounds/hover.wav',     volume: 0.20, enabled: true },
  // System
  ticketOpen:       { file: '/sounds/save.wav',         volume: 0.18, enabled: true },
  badgeEarned:      { file: '/sounds/win.wav',          volume: 0.38, enabled: true },
  notification:     { file: '/sounds/notification.wav', volume: 0.22, enabled: true },
  unlockNew:        { file: '/sounds/unlock.wav',       volume: 0.28, enabled: true },
  // UI (Erweitert)
  adminSave:        { file: '/sounds/success-soft.wav', volume: 0.22, enabled: true },
  formError:        { file: '/sounds/error.wav',        volume: 0.28, enabled: true },
  confirmDialog:    { file: '/sounds/blip.wav',         volume: 0.14, enabled: true },
  alertShow:        { file: '/sounds/notification.wav', volume: 0.18, enabled: true },
  selectItem:       { file: '/sounds/select.wav',       volume: 0.14, enabled: true },
  // Shop
  shopOpen:         { file: '/sounds/ui-open.wav',      volume: 0.18, enabled: true },
  itemDrop:         { file: '/sounds/drop.wav',         volume: 0.22, enabled: true },
  // Welt (Erweitert)
  critHit:          { file: '/sounds/crunch.wav',       volume: 0.32, enabled: true },
  healReceived:     { file: '/sounds/chime.wav',        volume: 0.22, enabled: true },
  battleStart:      { file: '/sounds/alarm.wav',        volume: 0.28, enabled: true },
  // Level & XP (Erweitert)
  rankUp:           { file: '/sounds/fanfare.wav',      volume: 0.38, enabled: true },
  questStart:       { file: '/sounds/ui-open.wav',      volume: 0.18, enabled: true },
  // Chat (Erweitert)
  warningAlert:     { file: '/sounds/alarm.wav',        volume: 0.30, enabled: true },
  dailyLogin:       { file: '/sounds/reward.wav',       volume: 0.32, enabled: true },
};

async function run() {
  const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // Read existing config to preserve custom settings
  const { rows } = await client.query("SELECT config FROM sound_config WHERE id = 'default'");
  const existing = rows[0]?.config ?? {};

  // Merge: existing settings win, new keys get defaults
  const merged = { ...DEFAULT_EVENTS, ...existing };
  // But ensure ALL new keys exist (existing might be missing new ones)
  for (const [key, val] of Object.entries(DEFAULT_EVENTS)) {
    if (!merged[key]) merged[key] = val;
  }

  await client.query(
    "INSERT INTO sound_config (id, config, updated_at) VALUES ('default', $1, NOW()) ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = NOW()",
    [JSON.stringify(merged)]
  );

  const eventCount = Object.keys(merged).length;
  console.log(`Sound-Config aktualisiert: ${eventCount} Events in DB gespeichert.`);
  await client.end();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
