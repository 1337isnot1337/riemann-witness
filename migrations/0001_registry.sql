CREATE TABLE witnesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  listed INTEGER NOT NULL CHECK (listed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  owner_hash TEXT NOT NULL UNIQUE,
  recovery_hash TEXT
);
CREATE INDEX witnesses_list ON witnesses(listed, id);
CREATE INDEX witnesses_search ON witnesses(listed, name_key, id);
CREATE INDEX witnesses_recovery ON witnesses(recovery_hash) WHERE recovery_hash IS NOT NULL;
CREATE TABLE limits (bucket TEXT PRIMARY KEY, expires INTEGER NOT NULL, hits INTEGER NOT NULL);
CREATE INDEX limits_expiry ON limits(expires);
CREATE TABLE totals (id INTEGER PRIMARY KEY, participants INTEGER NOT NULL);
INSERT INTO totals VALUES (1,0);
CREATE TRIGGER count_registration AFTER INSERT ON witnesses BEGIN
  UPDATE totals SET participants=participants+1 WHERE id=1;
END;
CREATE TRIGGER count_deletion AFTER DELETE ON witnesses BEGIN
  UPDATE totals SET participants=participants-1 WHERE id=1;
END;
