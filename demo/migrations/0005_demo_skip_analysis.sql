ALTER TABLE buyer_links ADD COLUMN skip_analysis INTEGER NOT NULL DEFAULT 0 CHECK (skip_analysis IN (0, 1));
ALTER TABLE inspections ADD COLUMN analysis_mode TEXT NOT NULL DEFAULT 'vision' CHECK (analysis_mode IN ('vision', 'skipped'));
