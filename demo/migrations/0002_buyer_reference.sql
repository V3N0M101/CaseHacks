ALTER TABLE inspections ADD COLUMN buyer_reference TEXT;
CREATE UNIQUE INDEX inspections_buyer_reference ON inspections (buyer_reference);
