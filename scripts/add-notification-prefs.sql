-- Add per-user notification preferences to profiles.
-- Run this once in your Supabase SQL editor or via the CLI.
-- Keys absent from the JSONB = notification enabled (opt-out model).
-- Keys explicitly set to false = notification suppressed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
