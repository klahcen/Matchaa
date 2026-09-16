-- ============================================================================
-- Browse/Suggestions binary matching test fixture
-- ============================================================================
-- Seeds a deterministic dataset for the simplified Matcha rule:
--   target.gender = viewer.sexual_preferences
--   target.sexual_preferences = viewer.gender
--
--   Run:  docker exec -i matcha-pg psql -U postgres -d matcha_db \
--             -v ON_ERROR_STOP=1 < Backend/scripts/seedBrowseFixtures.sql
--
--   All accounts share the password:  Br0wse!Test2026
--   Remove: DELETE FROM users WHERE username LIKE 'bt\_%';
-- ============================================================================

BEGIN;

DELETE FROM users WHERE username LIKE 'bt\_%';

INSERT INTO users (email, username, first_name, last_name, password_hash, is_verified,
                   gender, sexual_preferences, fame_rating, birthdate,
                   latitude, longitude, location_text) VALUES
 ('bt_vince@t.com','bt_vince','Vince','Viewer',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'male','female',20,'1995-03-03',33.5731,-7.5898,'Casablanca'),

 -- Visible: female candidates who are seeking male users.
 ('bt_near@t.com','bt_fem_near','Nadia','Near',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',30,'1996-05-05',33.5911,-7.5898,'Maarif, Casablanca'),
 ('bt_far@t.com','bt_fem_far','Farah','Far',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',100,'1994-01-01',35.3731,-7.5898,'Rabat'),
 ('bt_textpart@t.com','bt_fem_textpart','Salma','Textpart',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',10,'1991-06-06',NULL,NULL,'Casablanca, Morocco'),

 -- Excluded by binary preference, photo, verification, or blocks.
 ('bt_malenear@t.com','bt_male_near','Malek','Near',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'male','female',50,'1993-02-02',33.5831,-7.5898,'Casablanca'),
 ('bt_nonrecip@t.com','bt_fem_nonreciprocal','Imane','Nonreciprocal',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','female',10,'1997-07-07',33.5731,-7.5898,'Casablanca'),
 ('bt_nophoto@t.com','bt_fem_nophoto','Nophoto','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',10,'1997-07-07',33.5731,-7.5898,'Casablanca'),
 ('bt_blkbyv@t.com','bt_fem_blockedbyviewer','Blocked','ByViewer',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',10,'1998-08-08',33.5731,-7.5898,'Casablanca'),
 ('bt_blkv@t.com','bt_fem_blockedviewer','Blocker','OfViewer',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',TRUE,'female','male',10,'1999-09-09',33.5731,-7.5898,'Casablanca'),
 ('bt_unver@t.com','bt_fem_unverified','Unverified','User',
  '$2b$10$oFdWxw/SBgpUbaIeWyMtQuokSffDKEow4sbOc2.8LYYEQCwtZkoIS',FALSE,'female','male',10,'1989-11-11',33.5731,-7.5898,'Casablanca');

INSERT INTO photos (user_id, url, is_profile_picture)
SELECT u.id, '/uploads/photos/' || u.username || '.png', TRUE
FROM users u WHERE u.username LIKE 'bt\_%' AND u.username <> 'bt_fem_nophoto';

INSERT INTO tags (name) VALUES ('coffee'), ('football'), ('music') ON CONFLICT (name) DO NOTHING;

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username = 'bt_vince' AND t.name IN ('coffee','football');

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username = 'bt_fem_near' AND t.name IN ('coffee','football','music');

INSERT INTO user_tags (user_id, tag_id)
SELECT u.id, t.id FROM users u CROSS JOIN tags t
WHERE u.username IN ('bt_fem_far','bt_fem_textpart') AND t.name = 'coffee';

INSERT INTO blocks (blocker_id, blocked_id) VALUES
 ((SELECT id FROM users WHERE username='bt_vince'),
  (SELECT id FROM users WHERE username='bt_fem_blockedbyviewer')),
 ((SELECT id FROM users WHERE username='bt_fem_blockedviewer'),
  (SELECT id FROM users WHERE username='bt_vince'));

COMMIT;

-- Expected as bt_vince: visible candidates are bt_fem_near, bt_fem_textpart,
-- and bt_fem_far. Excluded: male, non-reciprocal female, no photo, blocked,
-- and unverified profiles.
SELECT COUNT(*) AS fixture_users FROM users WHERE username LIKE 'bt\_%';
