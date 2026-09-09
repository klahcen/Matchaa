-- ============================================================================
-- Browse/Suggestions test fixture
-- ============================================================================
-- Seeds a deterministic dataset that exercises every branch of the suggestion
-- query, so orientation filtering, exclusions, scoring, sorting, filtering and
-- pagination can all be verified by hand.
--
--   Run:  docker exec -i matcha-pg psql -U postgres -d matcha_db \
--             -v ON_ERROR_STOP=1 < Backend/scripts/seedBrowseFixtures.sql
--
--   All accounts share the password:  Br0wse!Test2026
--   (bcrypt hash below is a fixture for a throwaway test password, not a secret)
--
--   Remove:  DELETE FROM users WHERE username LIKE 'bt\_%';
--
-- Idempotent: it deletes its own rows first. Shared `tags` rows are left alone
-- because real users may already reference them.
-- ============================================================================

BEGIN;

DELETE FROM users WHERE username LIKE 'bt\_%';

-- ---------------------------------------------------------------------------
-- The viewer. Male + heterosexual, so the orientation filter must return only
-- women. Lives in Casablanca with GPS coordinates and two tags.
-- ---------------------------------------------------------------------------
INSERT INTO users (email, username, first_name, last_name, password_hash, is_verified,
                   gender, sexual_preferences, fame_rating, birthdate,
                   latitude, longitude, location_text)
VALUES ('bt_vince@t.com', 'bt_vince', 'Vince', 'Viewer',
        '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',
        TRUE, 'male', 'heterosexual', 20, '1995-03-03',
        33.5731, -7.5898, 'Casablanca');

-- ---------------------------------------------------------------------------
-- Candidates. Each one isolates a specific rule.
--
--   bt_fem_near       2 km away        -> same_area, should rank FIRST
--   bt_fem_far        200 km away      -> fame 100 yet ranks BELOW textpart,
--                                         proving fame cannot dominate
--   bt_male_near      male, 1 km       -> EXCLUDED (heterosexual viewer)
--   bt_fem_nophoto    no photo         -> EXCLUDED (no photo)
--   bt_fem_blockedbyviewer             -> EXCLUDED (viewer blocked her)
--   bt_fem_blockedviewer               -> EXCLUDED (she blocked the viewer)
--   bt_fem_notext     no GPS, no text  -> geo floor 0.10, ranks LAST
--   bt_fem_textpart   no GPS, text     -> text_partial 0.60 (same city)
--   bt_fem_gendernull gender NULL      -> EXCLUDED for a gendered viewer
--   bt_fem_unverified is_verified=false-> EXCLUDED (not verified)
-- ---------------------------------------------------------------------------
INSERT INTO users (email, username, first_name, last_name, password_hash, is_verified,
                   gender, sexual_preferences, fame_rating, birthdate,
                   latitude, longitude, location_text) VALUES
 ('bt_near@t.com','bt_fem_near','Nadia','Near',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',30,'1996-05-05',33.5911,-7.5898,'Maârif, Casablanca'),
 ('bt_far@t.com','bt_fem_far','Farah','Far',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',100,'1994-01-01',35.3731,-7.5898,'Rabat'),
 ('bt_malenear@t.com','bt_male_near','Malek','Near',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'male','heterosexual',50,'1993-02-02',33.5831,-7.5898,'Casablanca'),
 ('bt_nophoto@t.com','bt_fem_nophoto','Nophoto','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',10,'1997-07-07',33.5731,-7.5898,'Casablanca'),
 ('bt_blkbyv@t.com','bt_fem_blockedbyviewer','Blocked','ByViewer',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',10,'1998-08-08',33.5731,-7.5898,'Casablanca'),
 ('bt_blkv@t.com','bt_fem_blockedviewer','Blocker','OfViewer',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',10,'1999-09-09',33.5731,-7.5898,'Casablanca'),
 ('bt_notext@t.com','bt_fem_notext','Notext','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',10,'1992-04-04',NULL,NULL,NULL),
 ('bt_textpart@t.com','bt_fem_textpart','Textpart','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','heterosexual',10,'1991-06-06',NULL,NULL,'Casablanca, Morocco'),
 ('bt_gnull@t.com','bt_fem_gendernull','Genderless','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,NULL,'heterosexual',10,'1990-10-10',33.5731,-7.5898,'Casablanca'),
 ('bt_unver@t.com','bt_fem_unverified','Unverified','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',FALSE,'female','heterosexual',10,'1989-11-11',33.5731,-7.5898,'Casablanca');

-- ---------------------------------------------------------------------------
-- Alternate viewers, for testing the orientation matrix.
--   bt_homo_m            male + homosexual          -> only men
--   bt_bisex_f           female + bisexual          -> every gender
--   bt_nopref_m          preference NULL            -> treated as bisexual
--   bt_nogender_hetero   heterosexual, gender NULL  -> 0 results + gender_required
-- ---------------------------------------------------------------------------
INSERT INTO users (email, username, first_name, last_name, password_hash, is_verified,
                   gender, sexual_preferences, fame_rating, birthdate,
                   latitude, longitude, location_text) VALUES
 ('bt_homo@t.com','bt_homo_m','Hassan','Homosexual',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'male','homosexual',0,'1995-01-01',33.5731,-7.5898,'Casablanca'),
 ('bt_bisex@t.com','bt_bisex_f','Bianca','Bisexual',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','bisexual',0,'1995-01-01',33.5731,-7.5898,'Casablanca'),
 ('bt_nopref@t.com','bt_nopref_m','Nopref','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'male',NULL,0,'1995-01-01',33.5731,-7.5898,'Casablanca'),
 ('bt_nog@t.com','bt_nogender_hetero','Nogender','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,NULL,'heterosexual',0,'1995-01-01',33.5731,-7.5898,'Casablanca');

-- Photos for everyone EXCEPT bt_fem_nophoto (that one tests the photo rule).
INSERT INTO photos (user_id, url, is_profile_picture)
SELECT u.id, '/uploads/photos/' || u.username || '.png', TRUE
FROM users u WHERE u.username LIKE 'bt\_%' AND u.username <> 'bt_fem_nophoto';

-- Tags: 'vegan' and 'geek' belong to the viewer so shared-tag counts are non-zero.
INSERT INTO tags (name) VALUES ('vegan'), ('geek'), ('music') ON CONFLICT (name) DO NOTHING;

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username = 'bt_vince'       AND t.name IN ('vegan','geek');

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username = 'bt_fem_near'    AND t.name IN ('vegan','geek','music');

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username IN ('bt_fem_far','bt_fem_textpart') AND t.name = 'vegan';

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username = 'bt_fem_notext'  AND t.name = 'geek';

-- Blocks in BOTH directions, to prove either one hides the candidate.
INSERT INTO blocks (blocker_id, blocked_id) VALUES
 ((SELECT id FROM users WHERE username='bt_vince'),
  (SELECT id FROM users WHERE username='bt_fem_blockedbyviewer')),
 ((SELECT id FROM users WHERE username='bt_fem_blockedviewer'),
  (SELECT id FROM users WHERE username='bt_vince'));

COMMIT;

-- ---------------------------------------------------------------------------
-- Expected results for GET /api/browse/suggestions
-- ---------------------------------------------------------------------------
-- As bt_vince (male, heterosexual), sortBy=relevance, total = 5:
--     1. bt_fem_near      relevance 63   (2 km, same_area, 2 shared tags, fame 30)
--     2. bt_bisex_f       relevance 45   (same coords => same_area, but 0 shared
--                                         tags and fame 0: 100 x 0.45 x 1.0)
--     3. bt_fem_textpart  relevance 36   (no GPS, same city text, 1 shared tag)
--     4. bt_fem_far       relevance 24   (200 km away, fame 100 -- still 4th,
--                                         which proves fame cannot dominate)
--     5. bt_fem_notext    relevance 14   (no location at all -> geo floor 0.10)
--
--   Never present: bt_vince (self), bt_male_near / bt_homo_m / bt_nopref_m
--   (men, wrong gender for a heterosexual viewer), bt_fem_nophoto (no photo),
--   bt_fem_blockedbyviewer + bt_fem_blockedviewer (blocks, both directions),
--   bt_fem_gendernull (unknown gender), bt_fem_unverified (not verified),
--   bt_nogender_hetero (unknown gender).
--
-- As bt_homo_m          -> only men (bt_male_near, bt_vince, bt_nopref_m, ...)
-- As bt_bisex_f         -> every gender, including gender-NULL candidates
-- As bt_nopref_m        -> same as bisexual (preference NULL defaults to it)
-- As bt_nogender_hetero -> total 0, orientation.gender_required = true
-- ============================================================================

SELECT COUNT(*) AS fixture_users FROM users WHERE username LIKE 'bt\_%';
