CREATE TABLE buyer_links (
  token_hash TEXT PRIMARY KEY,
  buyer_reference TEXT NOT NULL,
  sku TEXT NOT NULL,
  catalog TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX buyer_links_expiry ON buyer_links (expires_at);
