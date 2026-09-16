/** Targeted live regressions for F1–F8. Requires a migrated test database.
 * Run: tsx scripts/testReportedFixes.ts F3 (or all).
 * Uses real HTTP, PostgreSQL and Socket.io; cleans up only its own fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import { generateAuthToken, hashPassword } from '../src/services/authService';
import { initializeSocketServer } from '../src/sockets/socketServer';

const selected = process.argv[2] || 'all';
const prefix = `fix${Date.now()}`;
const ids: number[] = [];
const results: object[] = [];
const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;
let base = '';
let a: any, b: any;
async function request(method: string, path: string, body?: any, cookie = a.cookie, headers = {}) {
  const response = await fetch(base + '/api' + path, {
    method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() as any };
}
async function test(name: string, fn: () => Promise<any>) {
  if (selected !== 'all' && selected !== name) return;
  const evidence = await fn();
  results.push({ name, status: 'PASS', evidence });
  console.log(JSON.stringify(results.at(-1)));
}
async function main() {
  const server = createApp().listen(0, '127.0.0.1');
  const io = initializeSocketServer(server);
  (global as any).io = io;
  await new Promise<void>(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const hash = await hashPassword('Audit!72UncommonPass');
    for (const [suffix, name] of [['a', 'Alice'], ['b', 'Bob']]) {
      const user = (await q(`INSERT INTO users(email,username,first_name,last_name,password_hash,is_verified,gender)
        VALUES($1,$2,$3,'Audit',$4,true,$5) RETURNING *`,
        [`${prefix}${suffix}@example.invalid`, prefix + suffix, name, hash, suffix === 'a' ? 'male' : 'female']))[0];
      ids.push(user.id);
      user.cookie = 'token=' + generateAuthToken({ userId: user.id, username: user.username, email: user.email });
      if (suffix === 'a') a = user; else b = user;
    }
    await test('F3', async () => {
      await q('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)', [a.id,b.id]);
      const forward = await request('GET', `/users/${b.id}`);
      const reverse = await request('GET', `/users/${a.id}`, undefined, b.cookie);
      assert.equal(forward.status,404); assert.equal(reverse.status,404);
      assert.equal((await q('SELECT * FROM views WHERE viewer_id=ANY($1)',[ids])).length,0);
      assert.equal((await q('SELECT * FROM notifications WHERE user_id=ANY($1)',[ids])).length,0);
      await q('DELETE FROM blocks WHERE blocker_id=$1',[a.id]);
      return {forward,reverse,views:0,notifications:0};
    });
    await test('F5', async () => {
      const evidence = [];
      for (const [route, cap] of [['login',10],['register',10],['forgot-password',5],['resend-verification',5]] as const) {
        const statuses = [];
        for (let i=0;i<cap+2;i++) {
          const payload = route === 'login' ? {username:prefix+'missing',password:'wrong'} : {};
          const r = await request('POST', '/auth/'+route, payload, '', {'X-Forwarded-For': `198.51.100.${i+1}`});
          statuses.push(r.status);
          assert.equal(r.status, i<cap ? (route === 'login' ? 401 : 400) : 429);
        }
        evidence.push({route,statuses});
      }
      return evidence;
    });
    await test('F1', async () => {
      const updates = [];
      for (const preference of ['male','female']) {
        const r = await request('PUT','/profile/me',{sexual_preferences:preference});
        assert.equal(r.status,200); assert.equal(r.body.data.sexual_preferences,preference);
        assert.equal((await q('SELECT sexual_preferences FROM users WHERE id=$1',[a.id]))[0].sexual_preferences,preference);
        updates.push({preference,status:r.status});
      }
      for (const preference of ['heterosexual','homosexual','bisexual','other']) {
        const r = await request('PUT','/profile/me',{sexual_preferences:preference});
        assert.equal(r.status,400);
      }
      await q("INSERT INTO photos(user_id,url) VALUES($1,'/audit-fixture.png')",[b.id]);
      await q("UPDATE users SET gender='male', sexual_preferences='female' WHERE id=$1",[a.id]);
      await q("UPDATE users SET gender='female', sexual_preferences='male' WHERE id=$1",[b.id]);
      for (const path of ['/browse/suggestions','/search']) {
        const r = await request('GET',path);
        assert.equal(r.status,200);
        assert.equal(r.body.data.orientation.preference,'female');
        assert.ok((r.body.data.suggestions || r.body.data.results).some((u:any)=>u.id===b.id));
      }
      await q("UPDATE users SET gender='male', sexual_preferences='female' WHERE id=$1",[b.id]);
      for (const path of ['/browse/suggestions','/search']) {
        const r = await request('GET',path);
        assert.equal(r.status,200);
        assert.ok(!(r.body.data.suggestions || r.body.data.results).some((u:any)=>u.id===b.id));
        }
      await q('DELETE FROM photos WHERE user_id=$1',[b.id]);
      return {updates,matching:'male seeking female sees reciprocal female, excludes male'};
    });
    await test('F2', async () => {
      await q("INSERT INTO photos(user_id,url,is_profile_picture) VALUES($1,'/audit-fixture.png',false)",[a.id]);
      const rejected = await request('POST',`/users/${b.id}/like`,{});
      assert.equal(rejected.status,403);
      const profile = await request('GET',`/users/${b.id}`);
      assert.equal(profile.body.data.viewer.has_profile_picture,false);
      assert.equal(profile.body.data.viewer.can_like,false);
      assert.match(profile.body.data.viewer.like_blocked_reason,/select a profile picture/);
      assert.equal((await q('SELECT * FROM likes WHERE liker_id=$1',[a.id])).length,0);
      await q('UPDATE photos SET is_profile_picture=true WHERE user_id=$1',[a.id]);
      const accepted = await request('POST',`/users/${b.id}/like`,{});
      assert.equal(accepted.status,201);
      await q('DELETE FROM likes WHERE liker_id=$1',[a.id]);
      await q('DELETE FROM photos WHERE user_id=$1',[a.id]);
      return {rejected,viewer:profile.body.data.viewer,selectedPictureStatus:accepted.status};
    });
    await test('F4', async () => {
      const photos = await q("INSERT INTO photos(user_id,url,is_profile_picture) VALUES($1,'/audit-main.png',true),($1,'/audit-other.png',false) RETURNING id,is_profile_picture",[a.id]);
      const other = photos.find(p=>!p.is_profile_picture), main = photos.find(p=>p.is_profile_picture);
      const first = await request('DELETE',`/profile/me/photos/${other.id}`);
      assert.equal(first.status,200); assert.equal(first.body.data.was_profile_picture,false);
      assert.equal(first.body.data.has_profile_picture,true); assert.equal(first.body.data.photo_count,1);
      const second = await request('DELETE',`/profile/me/photos/${main.id}`);
      assert.equal(second.status,200); assert.equal(second.body.data.was_profile_picture,true);
      assert.equal(second.body.data.has_profile_picture,false); assert.equal(second.body.data.photo_count,0);
      return {unrelatedPhoto:first,selectedPhoto:second};
    });
    await test('F6', async () => {
      const nextEmail = prefix+'new@example.invalid';
      await q("UPDATE users SET verification_token='old-registration-token',verification_token_expires_at=NOW()+interval '1 day' WHERE id=$1",[a.id]);
      const pending = await request('PUT','/profile/me',{email:nextEmail});
      assert.equal(pending.status,200); assert.equal(pending.body.data.email,a.email);
      assert.equal(pending.body.data.pending_email,nextEmail); assert.equal(pending.body.data.is_verified,true);
      assert.equal((await request('GET','/profile/me')).status,200);
      let row = (await q('SELECT * FROM users WHERE id=$1',[a.id]))[0];
      assert.equal(row.email,a.email); assert.equal(row.pending_email,nextEmail); assert.ok(row.verification_token);
      assert.equal((await request('GET','/auth/verify-email?token=old-registration-token')).status,400);
      const expiredToken = row.verification_token;
      await q("UPDATE users SET verification_token_expires_at=NOW()-interval '1 second' WHERE id=$1",[a.id]);
      assert.equal((await request('GET','/auth/verify-email?token='+expiredToken)).status,400);
      await request('PUT','/profile/me',{email:nextEmail});
      row = (await q('SELECT * FROM users WHERE id=$1',[a.id]))[0];
      assert.notEqual(row.verification_token,expiredToken);
      assert.equal((await request('GET','/auth/verify-email?token='+expiredToken)).status,400);
      const confirmed = await request('GET','/auth/verify-email?token='+row.verification_token);
      assert.equal(confirmed.status,200); assert.equal(confirmed.body.user.email,nextEmail);
      const active = (await q('SELECT email,pending_email,is_verified FROM users WHERE id=$1',[a.id]))[0];
      assert.deepEqual(active,{email:nextEmail,pending_email:null,is_verified:true});
      assert.equal((await request('GET','/profile/me')).status,200);
      assert.equal((await request('GET','/auth/verify-email?token='+row.verification_token)).status,200);
      // Re-check uniqueness at confirmation, not only when proposing the address.
      const contested = prefix+'contested@example.invalid';
      await request('PUT','/profile/me',{email:contested});
      row = (await q('SELECT verification_token FROM users WHERE id=$1',[a.id]))[0];
      await q('UPDATE users SET email=$1 WHERE id=$2',[contested,b.id]);
      const conflict = await request('GET','/auth/verify-email?token='+row.verification_token);
      assert.equal(conflict.status,409);
      assert.equal((await q('SELECT email FROM users WHERE id=$1',[a.id]))[0].email,nextEmail);
      return {pendingStatus:pending.status,oldEmailStillActive:pending.body.data.email,
        pendingEmail:pending.body.data.pending_email,verifiedWhilePending:true,
        confirmation:confirmed.status,active,expiredAndSupersededTokens:400,conflict};
    });
    await test('F7', async () => {
      await q('INSERT INTO likes(liker_id,liked_id) VALUES($1,$2),($2,$1)',[a.id,b.id]);
      const evidence = [];
      for (const path of ['/notifications',`/chat/${b.id}/messages`]) {
        for (const value of ['-1','0','101','1.5','abc','1abc','','1&limit=2']) {
          const r = await request('GET',path+'?limit='+value);
          assert.equal(r.status,400); evidence.push({path,limit:value,...r});
        }
        for (const suffix of ['', '?limit=1','?limit=100']) assert.equal((await request('GET',path+suffix)).status,200);
      }
      assert.equal((await request('GET','/notifications?offset=-1')).status,400);
      assert.equal((await request('GET',`/chat/${b.id}/messages?beforeId=-1`)).status,400);
      await q('DELETE FROM likes WHERE liker_id=ANY($1)',[ids]);
      return evidence;
    });
    await test('F8', async () => {
      // Reuse the frontend's installed Socket.io client without adding a backend dependency.
      const { io: connect } = require(require.resolve('socket.io-client', { paths: [process.env.SOCKET_CLIENT_ROOT || '/work/Frontend', process.cwd() + '/../Frontend'] }));
      const sockets: any[] = [];
      const events: any[][] = [[],[]];
      try {
        for (const [index,user] of [a,b].entries()) {
          const socket = connect(base,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},reconnection:false});
          sockets.push(socket);
          socket.on('notification:new',(event:any)=>events[index].push(event));
          await new Promise<void>((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('Socket connection timed out')),4000);
            socket.once('connect',()=>{clearTimeout(timer);resolve()});
            socket.once('connect_error',(e:any)=>{clearTimeout(timer);reject(e)});
          });
        }
        await q("INSERT INTO photos(user_id,url,is_profile_picture) VALUES($1,'/audit-a.png',true),($2,'/audit-b.png',true)",[a.id,b.id]);
        assert.equal((await request('POST',`/users/${b.id}/like`,{})).status,201);
        assert.equal((await request('POST',`/users/${a.id}/like`,{},b.cookie)).status,201);
        const deadline=Date.now()+4000;
        while (events.some(list=>!list.some(e=>e.type==='new_connection')) && Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
        const evidence = [];
        for (const [index,recipient,counterpart] of [[0,a,b],[1,b,a]] as const) {
          const event=events[index].find(e=>e.type==='new_connection'); assert.ok(event);
          assert.deepEqual(event.from_user,{id:counterpart.id,first_name:counterpart.first_name,username:counterpart.username});
          assert.equal(event.with_user_id,counterpart.id);
          const rows=await q("SELECT related_user_id,content FROM notifications WHERE user_id=$1 AND type='new_connection'",[recipient.id]);
          assert.equal(rows.length,1); assert.equal(rows[0].related_user_id,counterpart.id);
          assert.equal(rows[0].content,event.content); assert.ok(event.content.includes(counterpart.first_name));
          evidence.push({recipient:recipient.first_name,event,database:rows[0]});
        }
        return evidence;
      } finally { for (const socket of sockets) socket.disconnect(); }
    });
  } finally {
    await q('DELETE FROM users WHERE id=ANY($1)', [ids]);
    assert.equal((await q('SELECT id FROM users WHERE id=ANY($1)', [ids])).length,0);
    await new Promise<void>(resolve => io.close(() => resolve()));
    await pool.end();
    fs.writeFileSync(process.env.FIX_REPORT_PATH || `/tmp/matcha-fixes-${selected}.json`, JSON.stringify({ results, cleanedUserIds: ids }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
