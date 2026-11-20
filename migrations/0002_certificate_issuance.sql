CREATE TABLE certificate_issuance_daily (
  day_utc TEXT PRIMARY KEY,
  certificates INTEGER NOT NULL CHECK (certificates > 0)
);

CREATE TRIGGER count_certificate_issuance AFTER INSERT ON witnesses BEGIN
  INSERT INTO certificate_issuance_daily (day_utc, certificates)
  VALUES (date(NEW.created_at), 1)
  ON CONFLICT(day_utc) DO UPDATE SET certificates = certificates + 1;
END;
