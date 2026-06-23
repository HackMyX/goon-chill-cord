-- Run this once in the Supabase SQL Editor to enable the cross-player
-- aggro duration setting in the Admin → Games → Monster-Spawn panel.

ALTER TABLE world_config
  ADD COLUMN IF NOT EXISTS cross_player_aggro_duration_sec numeric DEFAULT 8;

-- Set the default row value if it already exists.
UPDATE world_config
   SET cross_player_aggro_duration_sec = 8
 WHERE id = 'default'
   AND cross_player_aggro_duration_sec IS NULL;
