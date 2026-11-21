CREATE TABLE inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  findings TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_at TEXT,
  decided_by TEXT
);

CREATE INDEX inspections_created_at ON inspections (created_at);
