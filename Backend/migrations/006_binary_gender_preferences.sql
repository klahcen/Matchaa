-- Simplify discovery to binary gender and binary desired gender.
-- Existing orientation words are converted before enum + NOT NULL enforcement:
--   gender: anything outside male/female -> male
--   sexual_preferences:
--     heterosexual -> opposite of gender
--     homosexual   -> same as gender
--     male/female  -> kept
--     bisexual/blank/other/NULL -> opposite of gender

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_gender') THEN
    CREATE TYPE user_gender AS ENUM ('male', 'female');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_sexual_preference') THEN
    CREATE TYPE user_sexual_preference AS ENUM ('male', 'female');
  END IF;
END $$;

ALTER TABLE users
  ALTER COLUMN gender DROP DEFAULT,
  ALTER COLUMN sexual_preferences DROP DEFAULT;

ALTER TABLE users
  ALTER COLUMN gender TYPE TEXT USING gender::TEXT,
  ALTER COLUMN sexual_preferences TYPE TEXT USING sexual_preferences::TEXT;

UPDATE users
SET gender = CASE
  WHEN LOWER(BTRIM(COALESCE(gender, ''))) IN ('male', 'female')
    THEN LOWER(BTRIM(gender))
  ELSE 'male'
END;

UPDATE users
SET sexual_preferences = CASE
  WHEN LOWER(BTRIM(COALESCE(sexual_preferences, ''))) IN ('male', 'female')
    THEN LOWER(BTRIM(sexual_preferences))
  WHEN LOWER(BTRIM(COALESCE(sexual_preferences, ''))) = 'homosexual'
    THEN gender
  ELSE CASE WHEN gender = 'male' THEN 'female' ELSE 'male' END
END;

ALTER TABLE users
  ALTER COLUMN gender TYPE user_gender USING gender::user_gender,
  ALTER COLUMN sexual_preferences TYPE user_sexual_preference USING sexual_preferences::user_sexual_preference,
  ALTER COLUMN gender SET NOT NULL,
  ALTER COLUMN sexual_preferences SET NOT NULL,
  ALTER COLUMN gender SET DEFAULT 'male',
  ALTER COLUMN sexual_preferences SET DEFAULT 'female';
