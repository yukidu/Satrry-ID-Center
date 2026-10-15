-- v252: draggable electronic-card field order and mobile density.
-- Individual members may override the shared default without changing profile data.
CREATE TABLE IF NOT EXISTS public_card_layouts (
  userId TEXT PRIMARY KEY,
  fieldOrder TEXT NOT NULL,
  mobileColumns INTEGER NOT NULL DEFAULT 1 CHECK(mobileColumns BETWEEN 1 AND 3),
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_card_layout_defaults (
  id INTEGER PRIMARY KEY CHECK(id=1),
  fieldOrder TEXT NOT NULL,
  mobileColumns INTEGER NOT NULL DEFAULT 1 CHECK(mobileColumns BETWEEN 1 AND 3),
  updatedBy TEXT,
  updatedAt INTEGER NOT NULL
);
