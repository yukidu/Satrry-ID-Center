-- v251: public electronic-card visual theme preference.
-- One fixed visual style per Starry ID member; public and edit-mode cards share the same theme.
CREATE TABLE IF NOT EXISTS public_card_preferences (
  userId TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'starry-cosmos' CHECK(theme IN (
    'starry-cosmos',
    'golden-prestige',
    'aurora-realm',
    'sunrise-paper',
    'neon-pulse',
    'forest-whisper',
    'ocean-flow',
    'sakura-ink',
    'lunar-minimal',
    'royal-gem'
  )),
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS public_card_preferences_theme
  ON public_card_preferences(theme);
