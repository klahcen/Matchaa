import { pool, query } from '../src/config/db';

async function main() {
  const hoursArg = process.argv[2] ? parseInt(process.argv[2], 10) : 24;
  const hours = isNaN(hoursArg) || hoursArg < 0 ? 24 : hoursArg;

  console.log(`[Cleanup] Searching for unverified users created more than ${hours} hours ago...`);

  try {
    const sql = `
      DELETE FROM users
      WHERE is_verified = FALSE
        AND created_at < NOW() - ($1 || ' hours')::INTERVAL
      RETURNING id, username, email, created_at;
    `;

    const result = await query(sql, [hours.toString()]);

    if (result.rows.length === 0) {
      console.log('[Cleanup] No orphaned unverified users found matching criteria.');
    } else {
      console.log(`[Cleanup] Successfully deleted ${result.rows.length} unverified user(s):`);
      for (const row of result.rows) {
        console.log(`  - [ID: ${row.id}] ${row.username} (${row.email}) created at ${row.created_at}`);
      }
    }
  } catch (error: any) {
    console.error('[Cleanup] Error executing cleanup query:', error.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
