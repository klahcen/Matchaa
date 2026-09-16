# Every automated live check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | 1.1 Register and bcrypt persistence | **PASS** | {"status":201,"body":{"success":true,"message":"Registration successful! Please check your email to verify your account.","user":{"id":1,"email":"e2e1789494883248a@example.invalid","username":"e2e1789494883248a","first_name":"Alice","last_name":"Test","is_verified":false,"gender":null,"sexual_preferences":"bisexual","biography":null,"fame_rating":0,"birthdate":null,"latitude":null,"longitude":null,"location_text":null,"last_connection":"2026-0… (full evidence in JSON) |
| 2 | 1.2 Duplicate email | **PASS** | {"status":409,"body":{"success":false,"message":"An account with this email address already exists"},"cookie":null} |
| 3 | 1.3 Duplicate username | **PASS** | {"status":409,"body":{"success":false,"message":"This username is already taken"},"cookie":null} |
| 4 | 1.4 Dictionary password | **PASS** | {"status":400,"body":{"success":false,"message":"Password is too common and easily guessable. Please choose a stronger password."},"cookie":null} |
| 5 | 1.5 Missing fields | **PASS** | {"status":400,"body":{"success":false,"message":"Email is required"},"cookie":null} |
| 6 | 1.6 Unverified login | **PASS** | {"status":403,"body":{"success":false,"message":"Your account is not verified yet. Please check your email to activate it."},"cookie":null} |
| 7 | 1.7 Verify DB token | **PASS** | {"status":200,"body":{"success":true,"message":"Email verified successfully! You can now log in.","user":{"id":1,"email":"e2e1789494883248a@example.invalid","username":"e2e1789494883248a","first_name":"Alice","last_name":"Test","is_verified":true,"gender":null,"sexual_preferences":"bisexual","biography":null,"fame_rating":0,"birthdate":null,"latitude":null,"longitude":null,"location_text":null,"last_connection":"2026-09-15T17:54:43.608Z","crea… (full evidence in JSON) |
| 8 | 1.8 Verified login cookie | **PASS** | {"status":200,"cookieFlags":[" Max-Age=86400"," Path=/"," Expires=Wed, 16 Sep 2026 17:54:44 GMT"," HttpOnly"," SameSite=Lax"]} |
| 9 | 1.9 Wrong password generic | **PASS** | {"known":{"success":false,"message":"Invalid username or password"},"unknown":{"success":false,"message":"Invalid username or password"}} |
| 10 | 1.10 Logout clears cookie | **PASS** | {"status":200,"body":{"success":true,"message":"Logged out successfully"},"cookie":"token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"} |
| 11 | 1.11 Forgot password generic | **PASS** | {"existing":{"success":true,"message":"If that email is registered, a password reset link has been sent."},"absent":{"success":true,"message":"If that email is registered, a password reset link has been sent."}} |
| 12 | 1.12 Reset password old/new login | **PASS** | {"reset":{"success":true,"message":"Password reset successful. You can now log in with your new password."},"old":401,"new":200} |
| 13 | 2.1 Own profile safe fields | **PASS** | {"status":200,"body":{"success":true,"data":{"id":1,"email":"e2e1789494883248a@example.invalid","username":"e2e1789494883248a","first_name":"Alice","last_name":"Test","is_verified":true,"gender":null,"sexual_preferences":"bisexual","biography":null,"fame_rating":0,"birthdate":null,"latitude":null,"longitude":null,"location_text":null,"last_connection":"2026-09-15T17:54:45.152Z","created_at":"2026-09-15T17:54:43.608Z","updated_at":"2026-09-15T1… (full evidence in JSON) |
| 14 | 2.2 Update basic information | **PASS** | {"first_name":"Alicia","last_name":"Tester","email":"e2e1789494883248changed@example.invalid","is_verified":true} |
| 15 | Security email change re-verification | **FAIL** | {"status":200,"is_verified":true} |
| 16 | 2.3 Valid preference heterosexual | **FAIL** | {"status":400,"body":{"success":false,"message":"Sexual preference must be one of: "},"cookie":null} |
| 17 | 2.3 Valid preference homosexual | **FAIL** | {"status":400,"body":{"success":false,"message":"Sexual preference must be one of: "},"cookie":null} |
| 18 | 2.3 Valid preference bisexual | **FAIL** | {"status":400,"body":{"success":false,"message":"Sexual preference must be one of: "},"cookie":null} |
| 19 | 2.3 Gender and biography persistence | **PASS** | {"gender":"female","biography":"Test biography"} |
| 20 | 2.3 Invalid enum gender | **PASS** | {"status":400,"body":{"success":false,"message":"Gender must be one of: male, female"},"cookie":null} |
| 21 | 2.3 Invalid enum sexual_preferences | **PASS** | {"status":400,"body":{"success":false,"message":"Sexual preference must be one of: "},"cookie":null} |
| 22 | 2.4 Case-insensitive shared tag | **PASS** | {"first":{"success":true,"message":"Tag added","data":{"id":1,"name":"e2e1789494883248tag"}},"second":{"success":true,"message":"Tag already on your profile","data":{"id":1,"name":"e2e1789494883248tag"}}} |
| 23 | 2.5 Remove only tag link | **PASS** | {"success":true,"message":"Tag removed from your profile"} |
| 24 | 2.6 Upload five photos files and rows | **PASS** | [{"id":1,"user_id":1,"url":"/uploads/photos/1789494885491-18-jfphduco.png","is_profile_picture":true,"created_at":"2026-09-15T17:54:45.508Z","fame_rating":0},{"id":2,"user_id":1,"url":"/uploads/photos/1789494885527-18-iz84i92j.png","is_profile_picture":false,"created_at":"2026-09-15T17:54:45.531Z","fame_rating":0},{"id":3,"user_id":1,"url":"/uploads/photos/1789494885545-18-sibb5baj.png","is_profile_picture":false,"created_at":"2026-09-15T17:54… (full evidence in JSON) |
| 25 | 2.6 Sixth photo rejected | **PASS** | {"status":400,"body":{"success":false,"message":"You already have the maximum of 5 photos. Delete one before uploading another."},"cookie":null} |
| 26 | 2.6 Non-image rejected | **PASS** | {"status":400,"body":{"success":false,"message":"Unsupported image type \"text/plain\". Allowed types: JPEG, PNG, WebP."},"cookie":null} |
| 27 | 2.7 Change profile picture | **PASS** | [{"id":2}] |
| 28 | 2.8 Delete photo file and row | **PASS** | {"success":true,"message":"Photo deleted","data":{"deleted_id":1,"was_profile_picture":false,"has_profile_picture":false,"photo_count":4,"fame_rating":0}} |
| 29 | Extra delete non-profile photo response flag | **FAIL** | {"success":true,"message":"Photo deleted","data":{"deleted_id":1,"was_profile_picture":false,"has_profile_picture":false,"photo_count":4,"fame_rating":0}} |
| 30 | 2.9 Manual location | **PASS** | {"success":true,"message":"Location updated","data":{"latitude":null,"longitude":null,"location_text":"Audit City","fame_rating":0}} |
| 31 | 2.10 Numeric fame rating | **PASS** | 0 |
| 32 | 2.11 Auth absent GET/me | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 33 | 2.11 Auth absent PUT/me | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 34 | 2.11 Auth absent PUT/me/location | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 35 | 2.11 Auth absent GET/me/tags | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 36 | 2.11 Auth absent POST/me/tags | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 37 | 2.11 Auth absent DELETE/me/tags/1 | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 38 | 2.11 Auth absent POST/me/photos | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 39 | 2.11 Auth absent DELETE/me/photos/1 | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 40 | 2.11 Auth absent PUT/me/photos/1/set-profile-picture | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 41 | 2.11 Auth absent GET/me/views | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 42 | 2.11 Auth absent GET/me/likes | **PASS** | {"status":401,"body":{"success":false,"message":"Authentication required. Please log in."}} |
| 43 | 2.11 Auth invalid GET/me | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 44 | 2.11 Auth invalid PUT/me | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 45 | 2.11 Auth invalid PUT/me/location | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 46 | 2.11 Auth invalid GET/me/tags | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 47 | 2.11 Auth invalid POST/me/tags | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 48 | 2.11 Auth invalid DELETE/me/tags/1 | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 49 | 2.11 Auth invalid POST/me/photos | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 50 | 2.11 Auth invalid DELETE/me/photos/1 | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 51 | 2.11 Auth invalid PUT/me/photos/1/set-profile-picture | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 52 | 2.11 Auth invalid GET/me/views | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 53 | 2.11 Auth invalid GET/me/likes | **PASS** | {"status":401,"body":{"success":false,"message":"Invalid authentication token."}} |
| 54 | 3.1 No params valid list excludes self | **PASS** | {"success":true,"data":{"suggestions":[{"id":2,"username":"e2e1789494883248f0","first_name":"Fixture0","last_name":"Test","age":22,"gender":"male","photo_url":"/uploads/photos/1789494886123-18-q9aqdir6.png","location_text":"Audit City","fame_rating":10,"shared_tag_count":2,"shared_tags":["e2e1789494883248tag","e2e1789494883248two"],"distance_km":111.2,"same_area":true,"relevance_score":58},{"id":3,"username":"e2e1789494883248f1","first_name":"… (full evidence in JSON) |
| 55 | 3.2 Orientation heterosexual | **PASS** | {"ids":[3,5],"expected":[3,5]} |
| 56 | 3.2 Orientation homosexual | **PASS** | {"ids":[2,4],"expected":[2,4]} |
| 57 | 3.2 Orientation bisexual | **PASS** | {"ids":[2,3,4,5],"expected":[2,3,4,5]} |
| 58 | 3.2 Orientation null | **PASS** | {"ids":[2,3,4,5],"expected":[2,3,4,5]} |
| 59 | 3.3 Filter minAge=25&maxAge=45 | **PASS** | {"status":200,"ids":[3,4],"expected":[3,4]} |
| 60 | 3.3 Filter minFame=25&maxFame=55 | **PASS** | {"status":200,"ids":[3,4],"expected":[3,4]} |
| 61 | 3.3 Filter location=Audit | **PASS** | {"status":200,"ids":[2,3],"expected":[2,3]} |
| 62 | 3.3 Filter tags=e2e1789494883248tag | **PASS** | {"status":200,"ids":[2,3,4],"expected":[2,3,4]} |
| 63 | 3.3 Filter minAge=25&maxAge=45&minFame=25&maxFame=55&location=Audit&tags=e2e1789494883248tag | **PASS** | {"status":200,"ids":[3],"expected":[3]} |
| 64 | 3.4 Sort age asc | **PASS** | {"status":200,"values":[22,32,42,52]} |
| 65 | 3.4 Sort age desc | **PASS** | {"status":200,"values":[52,42,32,22]} |
| 66 | 3.4 Sort fame asc | **PASS** | {"status":200,"values":[10,30,50,70]} |
| 67 | 3.4 Sort fame desc | **PASS** | {"status":200,"values":[70,50,30,10]} |
| 68 | 3.4 Sort commonTags asc | **PASS** | {"status":200,"values":[0,1,1,2]} |
| 69 | 3.4 Sort commonTags desc | **PASS** | {"status":200,"values":[2,1,1,0]} |
| 70 | 3.4 Sort location asc | **PASS** | {"status":200,"values":[111.2,222.4,333.6,444.8]} |
| 71 | 3.4 Sort location desc | **PASS** | {"status":200,"values":[444.8,333.6,222.4,111.2]} |
| 72 | 3.4 Sort relevance asc | **PASS** | {"status":200,"values":[58,58,19,14]} |
| 73 | 3.4 Sort relevance desc | **PASS** | {"status":200,"values":[58,58,19,14]} |
| 74 | 3.5 Invalid minAge=40&maxAge=20 | **PASS** | {"status":400,"body":{"success":false,"message":"minAge (40) cannot be greater than maxAge (20)"},"cookie":null} |
| 75 | 3.5 Invalid sortBy=invalid | **PASS** | {"status":400,"body":{"success":false,"message":"sortBy must be one of: relevance, age, location, fame, commonTags (got \"invalid\")"},"cookie":null} |
| 76 | 3.6 Pagination slices and total | **PASS** | {"page1":{"page":1,"limit":2,"total":4,"total_pages":2,"has_next":true,"has_prev":false},"page2":{"page":2,"limit":2,"total":4,"total_pages":2,"has_next":false,"has_prev":true}} |
| 77 | 3.7 Blocks excluded both directions | **PASS** | {"ids":[3,4,5],"reverse":[3,5]} |
| 78 | 4.1 No params valid list excludes self | **PASS** | {"success":true,"data":{"results":[{"id":5,"username":"e2e1789494883248f3","first_name":"Fixture3","last_name":"Test","age":52,"gender":"female","photo_url":"/uploads/photos/1789494886761-18-ifn70tp1.png","location_text":"Far City","fame_rating":70,"shared_tag_count":0,"shared_tags":[],"distance_km":444.8,"same_area":false},{"id":4,"username":"e2e1789494883248f2","first_name":"Fixture2","last_name":"Test","age":42,"gender":"male","photo_url":"… (full evidence in JSON) |
| 79 | 4.2 Orientation heterosexual | **PASS** | {"ids":[5,3],"expected":[3,5]} |
| 80 | 4.2 Orientation homosexual | **PASS** | {"ids":[4,2],"expected":[2,4]} |
| 81 | 4.2 Orientation bisexual | **PASS** | {"ids":[5,4,3,2],"expected":[2,3,4,5]} |
| 82 | 4.2 Orientation null | **PASS** | {"ids":[5,4,3,2],"expected":[2,3,4,5]} |
| 83 | 4.3 Filter minAge=25&maxAge=45 | **PASS** | {"status":200,"ids":[3,4],"expected":[3,4]} |
| 84 | 4.3 Filter minFame=25&maxFame=55 | **PASS** | {"status":200,"ids":[3,4],"expected":[3,4]} |
| 85 | 4.3 Filter location=Audit | **PASS** | {"status":200,"ids":[2,3],"expected":[2,3]} |
| 86 | 4.3 Filter tags=e2e1789494883248tag | **PASS** | {"status":200,"ids":[2,3,4],"expected":[2,3,4]} |
| 87 | 4.3 Filter minAge=25&maxAge=45&minFame=25&maxFame=55&location=Audit&tags=e2e1789494883248tag | **PASS** | {"status":200,"ids":[3],"expected":[3]} |
| 88 | 4.4 Sort age asc | **PASS** | {"status":200,"values":[22,32,42,52]} |
| 89 | 4.4 Sort age desc | **PASS** | {"status":200,"values":[52,42,32,22]} |
| 90 | 4.4 Sort fame asc | **PASS** | {"status":200,"values":[10,30,50,70]} |
| 91 | 4.4 Sort fame desc | **PASS** | {"status":200,"values":[70,50,30,10]} |
| 92 | 4.4 Sort commonTags asc | **PASS** | {"status":200,"values":[0,1,1,2]} |
| 93 | 4.4 Sort commonTags desc | **PASS** | {"status":200,"values":[2,1,1,0]} |
| 94 | 4.4 Sort location asc | **PASS** | {"status":200,"values":[111.2,222.4,333.6,444.8]} |
| 95 | 4.4 Sort location desc | **PASS** | {"status":200,"values":[444.8,333.6,222.4,111.2]} |
| 96 | 4.5 Invalid minAge=40&maxAge=20 | **PASS** | {"status":400,"body":{"success":false,"message":"minAge (40) cannot be greater than maxAge (20)"},"cookie":null} |
| 97 | 4.5 Invalid sortBy=invalid | **PASS** | {"status":400,"body":{"success":false,"message":"sortBy must be one of: age, location, fame, commonTags (got \"invalid\")"},"cookie":null} |
| 98 | 4.6 Pagination slices and total | **PASS** | {"page1":{"page":1,"limit":2,"total":4,"total_pages":2,"has_next":true,"has_prev":false},"page2":{"page":2,"limit":2,"total":4,"total_pages":2,"has_next":false,"has_prev":true}} |
| 99 | 4.7 Blocks excluded both directions | **PASS** | {"ids":[5,4,3],"reverse":[5,3]} |
| 100 | 5.1 Public profile records view and hides secrets | **PASS** | {"success":true,"data":{"id":2,"username":"e2e1789494883248f0","first_name":"Fixture0","last_name":"Test","age":22,"gender":"male","sexual_preferences":"heterosexual","biography":"Fixture","fame_rating":10,"location_text":"Audit City","member_since":"2026-09-15T17:54:45.931Z","photos":[{"id":6,"url":"/uploads/photos/1789494886123-18-q9aqdir6.png","is_profile_picture":true,"created_at":"2026-09-15T17:54:46.126Z"}],"tags":[{"id":1,"name":"e2e178… (full evidence in JSON) |
| 101 | 5.2 Like with zero photos | **PASS** | {"status":403,"body":{"success":false,"message":"You need to add at least one photo to your own profile before you can like other members."},"cookie":null} |
| 102 | 5.3 Like with profile picture | **PASS** | {"status":201,"body":{"success":true,"message":"You liked this member","data":{"has_liked":true,"has_liked_me":false,"is_connected":false,"newly_connected":false,"target_fame_rating":14,"pending_notifications":[{"type":"like_received","for_user_id":2,"from_user_id":1,"delivered":false}]}},"cookie":null} |
| 103 | 5.4 Duplicate like | **PASS** | {"status":400,"body":{"success":false,"message":"You have already liked this member"},"cookie":null} |
| 104 | 5.5 Mutual connection both users | **PASS** | {"status":201,"body":{"success":true,"message":"You liked this member — it is a match, you are now connected!","data":{"has_liked":true,"has_liked_me":true,"is_connected":true,"newly_connected":true,"target_fame_rating":13,"pending_notifications":[{"type":"like_received","for_user_id":1,"from_user_id":2,"delivered":false},{"type":"new_connection","for_user_id":2,"with_user_id":1,"delivered":false},{"type":"new_connection","for_user_id":1,"with… (full evidence in JSON) |
| 105 | 6.1 Bidirectional live socket delivery and DB messages | **PASS** | {"m1":{"success":true,"message":{"id":1,"sender_id":1,"receiver_id":2,"content":"Audit hello","created_at":"2026-09-15T17:54:48.771Z","read_at":null}},"m2":{"success":true,"message":{"id":2,"sender_id":2,"receiver_id":1,"content":"Audit reply","created_at":"2026-09-15T17:54:48.797Z","read_at":null}},"delivered":[{"event":"message:new","data":{"id":1,"sender_id":1,"receiver_id":2,"content":"Audit hello","created_at":"2026-09-15T17:54:48.771Z","… (full evidence in JSON) |
| 106 | 6.1 Connected REST history | **PASS** | {"status":200,"body":{"success":true,"data":{"messages":[{"id":1,"sender_id":1,"receiver_id":2,"content":"Audit hello","created_at":"2026-09-15T17:54:48.771Z","read_at":null,"sender_first_name":"Alicia","sender_username":"e2e1789494883248a"},{"id":2,"sender_id":2,"receiver_id":1,"content":"Audit reply","created_at":"2026-09-15T17:54:48.797Z","read_at":null,"sender_first_name":"Fixture0","sender_username":"e2e1789494883248f0"}]}},"cookie":null} |
| 107 | 6.2 Non-connected socket and REST rejection | **PASS** | {"socket":{"success":false,"error":"You can only message connected users"},"rest":{"status":403,"body":{"success":false,"message":"You can only view messages with connected users"},"cookie":null}} |
| 108 | 5.6 Unlike breaks connection and chat | **PASS** | {"unlike":{"success":true,"message":"Like removed — you are no longer connected and chat is no longer possible","data":{"has_liked":false,"has_liked_me":true,"is_connected":false,"connection_broken":true,"target_fame_rating":11}},"socket":{"success":false,"error":"You can only message connected users"},"history":403} |
| 109 | 6.3 Notification DB and socket like | **PASS** | {"rows":[{"user_id":2,"type":"like","related_user_id":1,"content":"Alicia liked your profile"},{"user_id":1,"type":"like","related_user_id":2,"content":"Fixture0 liked your profile"}],"events":[{"event":"notification:new","data":{"type":"like","from_user":{"id":2,"first_name":"Fixture0","username":"e2e1789494883248f0"},"content":"Fixture0 liked your profile","created_at":"2026-09-15T17:54:48.683Z"}},{"event":"notification:new","data":{"type":"… (full evidence in JSON) |
| 110 | 6.3 Notification DB and socket view | **PASS** | {"rows":[{"user_id":2,"type":"view","related_user_id":1,"content":"Alicia viewed your profile"},{"user_id":1,"type":"view","related_user_id":2,"content":"Fixture0 viewed your profile"}],"events":[{"event":"notification:new","data":{"type":"view","from_user":{"id":2,"first_name":"Fixture0","username":"e2e1789494883248f0"},"content":"Fixture0 viewed your profile","created_at":"2026-09-15T17:54:48.746Z"}},{"event":"notification:new","data":{"type… (full evidence in JSON) |
| 111 | 6.3 Notification DB and socket message | **PASS** | {"rows":[{"user_id":2,"type":"message","related_user_id":1,"content":"New message from Alicia"},{"user_id":1,"type":"message","related_user_id":2,"content":"New message from Fixture0"}],"events":[{"event":"notification:new","data":{"type":"message","from_user":{"id":2,"first_name":"Fixture0","username":"e2e1789494883248f0"},"content":"New message from Fixture0","created_at":"2026-09-15T17:54:48.805Z"}},{"event":"notification:new","data":{"type… (full evidence in JSON) |
| 112 | 6.3 Notification DB and socket new_connection | **PASS** | {"rows":[{"user_id":2,"type":"new_connection","related_user_id":1,"content":"You and Fixture0 liked each other — you are now connected!"},{"user_id":1,"type":"new_connection","related_user_id":2,"content":"You and Fixture0 liked each other — you are now connected!"}],"events":[{"event":"notification:new","data":{"type":"new_connection","from_user":{"id":2,"first_name":"Fixture0","username":"e2e1789494883248f0"},"with_user_id":2,"content":"You … (full evidence in JSON) |
| 113 | 6.3 Notification DB and socket unlike | **PASS** | {"rows":[{"user_id":2,"type":"unlike","related_user_id":1,"content":"Alicia removed their like"}],"events":[{"event":"notification:new","data":{"type":"unlike","from_user":{"id":1,"first_name":"Alicia","username":"e2e1789494883248a"},"content":"Alicia removed their like","created_at":"2026-09-15T17:54:49.046Z"}}]} |
| 114 | 6.4 Unread count 1 | **PASS** | {"api":{"success":true,"data":{"unread_count":4}},"db":4} |
| 115 | 6.4 Unread count 2 | **PASS** | {"api":{"success":true,"data":{"unread_count":5}},"db":5} |
| 116 | 5.8 Report row created | **PASS** | {"status":201,"body":{"success":true,"message":"Report submitted. Our moderators will review this account.","data":{"report_id":1,"reported_id":3,"reason":"Audit test fake profile","created_at":"2026-09-15T17:54:49.301Z","pending_notifications":[]}},"cookie":null} |
| 117 | 5.9 Self like | **PASS** | {"status":400,"body":{"success":false,"message":"You cannot perform this action on your own profile"},"cookie":null} |
| 118 | 5.9 Self block | **PASS** | {"status":400,"body":{"success":false,"message":"You cannot perform this action on your own profile"},"cookie":null} |
| 119 | 5.9 Self report | **PASS** | {"status":400,"body":{"success":false,"message":"You cannot perform this action on your own profile"},"cookie":null} |
| 120 | 5.7 Block removes both likes | **PASS** | {"status":201,"body":{"success":true,"message":"Member blocked. They will no longer appear in your suggestions or search results.","data":{"has_blocked":true,"is_connected":false,"connection_broken":true,"likes_removed":2,"viewer_fame_rating":11,"target_fame_rating":11,"pending_notifications":[]}},"cookie":null} |
| 121 | 5.10 Block inaccessibility blocker GET | **FAIL** | {"status":200,"body":{"success":true,"data":{"id":2,"username":"e2e1789494883248f0","first_name":"Fixture0","last_name":"Test","age":22,"gender":"male","sexual_preferences":"heterosexual","biography":"Fixture","fame_rating":11,"location_text":"Audit City","member_since":"2026-09-15T17:54:45.931Z","photos":[{"id":10,"url":"/uploads/photos/1789494888564-18-b24j98vr.png","is_profile_picture":true,"created_at":"2026-09-15T17:54:48.568Z"}],"tags":[… (full evidence in JSON) |
| 122 | 5.10 Block inaccessibility blocker POST/like | **PASS** | {"status":403,"body":{"success":false,"message":"You have blocked this member. Unblock them from your profile before interacting."}} |
| 123 | 5.10 Block inaccessibility blocker POST/block | **PASS** | {"status":403,"body":{"success":false,"message":"You have blocked this member. Unblock them from your profile before interacting."}} |
| 124 | 5.10 Block inaccessibility blocked GET | **PASS** | {"status":404,"body":{"success":false,"message":"This profile does not exist"}} |
| 125 | 5.10 Block inaccessibility blocked POST/like | **PASS** | {"status":404,"body":{"success":false,"message":"This profile does not exist"}} |
| 126 | 5.10 Block inaccessibility blocked POST/block | **PASS** | {"status":404,"body":{"success":false,"message":"This profile does not exist"}} |
| 127 | 5.2 Like with photos but NO flagged profile picture | **FAIL** | {"status":201,"body":{"success":true,"message":"You liked this member","data":{"has_liked":true,"has_liked_me":false,"is_connected":false,"newly_connected":false,"target_fame_rating":13,"pending_notifications":[{"type":"like_received","for_user_id":3,"from_user_id":1,"delivered":false}]}},"cookie":null} |
| 128 | Security rate limit resists spoofed X-Forwarded-For | **FAIL** | {"sameIP":[401,401,401,401,401,401,401,401,401,401,429],"changedHeader":401} |
| 129 | Extra negative notification limit validation | **FAIL** | {"status":500,"body":{"success":false,"message":"An unexpected internal server error occurred. Please try again later."},"cookie":null} |
| 130 | Extra mark all notifications read | **PASS** | {"status":200,"body":{"success":true,"message":"5 notifications marked as read","data":{"count":5}},"cookie":null} |
| 131 | Cleanup test users, tags, uploaded files | **PASS** | {"deletedUserIds":[1,2,3,4,5],"remainingTables":[{"name":"users","count":0},{"name":"photos","count":0},{"name":"tags","count":0},{"name":"messages","count":0},{"name":"notifications","count":0}]} |
