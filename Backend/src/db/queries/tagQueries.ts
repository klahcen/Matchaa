import { query } from '../../config/db';

export interface TagRow {
  id: number;
  name: string;
}

/**
 * Finds an existing tag by lowercase-normalized name, or creates it.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING ... RETURNING followed by a SELECT
 * fallback so two concurrent requests for the same new tag cannot both insert
 * (the UNIQUE constraint on tags.name would otherwise throw a 23505 error).
 */
export const findOrCreateTag = async (name: string): Promise<TagRow> => {
  const normalized = name.trim().toLowerCase();

  const inserted = await query<TagRow>(
    `INSERT INTO tags (name) VALUES ($1)
     ON CONFLICT (name) DO NOTHING
     RETURNING id, name;`,
    [normalized]
  );

  if (inserted.rows.length > 0) {
    return inserted.rows[0];
  }

  const existing = await query<TagRow>(`SELECT id, name FROM tags WHERE name = $1 LIMIT 1`, [
    normalized,
  ]);
  return existing.rows[0];
};

/**
 * Looks a tag up by name without creating it.
 */
export const findTagByName = async (name: string): Promise<TagRow | null> => {
  const result = await query<TagRow>(`SELECT id, name FROM tags WHERE name = $1 LIMIT 1`, [
    name.trim().toLowerCase(),
  ]);
  return result.rows[0] ?? null;
};

/**
 * Looks a tag up by id (used to 404 on DELETE of an unknown tag).
 */
export const findTagById = async (id: number): Promise<TagRow | null> => {
  const result = await query<TagRow>(`SELECT id, name FROM tags WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
};

/**
 * Returns every tag in the shared table, alphabetically.
 */
export const getAllTags = async (): Promise<TagRow[]> => {
  const result = await query<TagRow>(`SELECT id, name FROM tags ORDER BY name ASC`);
  return result.rows;
};

/**
 * Autocomplete search: partial, case-insensitive prefix-then-substring match.
 * Prefix matches are ranked first so typing "veg" surfaces "vegan" before "raw-vegan".
 */
export const searchTags = async (searchText: string): Promise<TagRow[]> => {
  const normalized = searchText.trim().toLowerCase().replace(/^#/, '');
  if (!normalized) return [];

  const sql = `
    SELECT id, name
    FROM tags
    WHERE name LIKE $1 OR name LIKE $2
    ORDER BY (name LIKE $1) DESC, name ASC
    LIMIT 20;
  `;
  const result = await query<TagRow>(sql, [`${normalized}%`, `%${normalized}%`]);
  return result.rows;
};

/**
 * Tags currently linked to a user.
 */
export const getUserTags = async (userId: number): Promise<TagRow[]> => {
  const sql = `
    SELECT t.id, t.name
    FROM tags t
    JOIN user_tags ut ON t.id = ut.tag_id
    WHERE ut.user_id = $1
    ORDER BY t.name ASC;
  `;
  const result = await query<TagRow>(sql, [userId]);
  return result.rows;
};

/**
 * Links a tag to a user. Idempotent: re-adding an existing pair is a no-op,
 * not an error, so the frontend can retry safely.
 * Returns true when a new association was created.
 */
export const addTagToUser = async (userId: number, tagId: number): Promise<boolean> => {
  const sql = `
    INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2)
    ON CONFLICT (user_id, tag_id) DO NOTHING;
  `;
  const result = await query(sql, [userId, tagId]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Unlinks a tag from a user. Does NOT delete the tag from the shared table.
 * Returns the number of associations removed (0 when it was never linked).
 */
export const removeTagFromUser = async (userId: number, tagId: number): Promise<number> => {
  const result = await query(`DELETE FROM user_tags WHERE user_id = $1 AND tag_id = $2`, [
    userId,
    tagId,
  ]);
  return result.rowCount ?? 0;
};

/**
 * Counts tags linked to a user — used by the fame rating "profile complete" check.
 */
export const countUserTags = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM user_tags WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};
