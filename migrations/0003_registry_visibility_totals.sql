ALTER TABLE totals ADD COLUMN public_participants INTEGER NOT NULL DEFAULT 0 CHECK (public_participants >= 0);
UPDATE totals SET public_participants = (SELECT COUNT(*) FROM witnesses WHERE listed=1) WHERE id=1;

DROP TRIGGER count_registration;
DROP TRIGGER count_deletion;
CREATE TRIGGER count_registration AFTER INSERT ON witnesses BEGIN
  UPDATE totals SET participants=participants+1, public_participants=public_participants+NEW.listed WHERE id=1;
END;
CREATE TRIGGER count_deletion AFTER DELETE ON witnesses BEGIN
  UPDATE totals SET participants=participants-1, public_participants=public_participants-OLD.listed WHERE id=1;
END;
CREATE TRIGGER count_visibility_change AFTER UPDATE OF listed ON witnesses WHEN OLD.listed<>NEW.listed BEGIN
  UPDATE totals SET public_participants=public_participants+NEW.listed-OLD.listed WHERE id=1;
END;
