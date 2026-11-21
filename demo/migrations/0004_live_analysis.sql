CREATE TABLE buyer_analyses (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL REFERENCES buyer_links(token_hash) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('item', 'label')),
  findings TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL
);
CREATE INDEX buyer_analyses_token_hash ON buyer_analyses (token_hash);
