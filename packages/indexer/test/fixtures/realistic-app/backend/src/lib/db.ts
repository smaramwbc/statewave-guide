/** A very small pretend database layer. */

/** A parameter accepted by {@link query}. */
export type QueryParameter = string | number | boolean | null;

/** Rows returned by a statement. */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** The pool the process shares. */
const pool = {
  async execute<T>(sql: string, parameters: QueryParameter[]): Promise<QueryResult<T>> {
    void sql;
    void parameters;
    return { rows: [], rowCount: 0 };
  },
};

/** Runs a statement and returns its rows. */
export async function query<T>(sql: string, parameters: QueryParameter[] = []): Promise<T[]> {
  const result = await pool.execute<T>(sql, parameters);
  return result.rows;
}

/** Runs a statement and returns the single row it must produce. */
export async function queryOne<T>(sql: string, parameters: QueryParameter[] = []): Promise<T | null> {
  const rows = await query<T>(sql, parameters);
  return rows.length > 0 ? rows[0]! : null;
}
