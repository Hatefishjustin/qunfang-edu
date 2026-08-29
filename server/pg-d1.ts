// PostgreSQL 适配层：用 pg 连接池模拟 Cloudflare D1 API（prepare/bind/all/first/run/batch）
// 业务代码全部走 c.env.DB.prepare(...).bind(...).all/first/run() 统一模式，
// 本模块把调用翻译成 PostgreSQL 方言，实现「同一套代码跑两个云」。
import pg from 'pg';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from '@cloudflare/workers-types';

// D1 的 SQLite 把整数返回为 number；PG 的 bigint/numeric 默认返回字符串，这里对齐
pg.types.setTypeParser(20, (v) => Number(v)); // int8（COUNT(*) 等）
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

/** SQLite 方言 → PostgreSQL 方言翻译（不含参数占位符处理） */
export function translateDialect(sql: string): string {
  let out = sql;
  // datetime('now')：D1 返回 UTC 'YYYY-MM-DD HH:MM:SS'
  out = out.replace(
    /datetime\('now'\)/g,
    "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')",
  );
  // date('now','localtime')：北京时间当日日期
  out = out.replace(
    /date\('now',\s*'localtime'\)/g,
    "to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')",
  );
  // 同事务内取最近一次自增 id（D1 的写法 → PG 的 lastval）
  out = out.replace(/rowid\s*=\s*last_insert_rowid\(\)/g, 'id = lastval()');
  // LIKE → ILIKE（SQLite 的 LIKE 不区分大小写，对齐）
  out = out.replace(/\bLIKE\b/g, 'ILIKE');
  return out;
}

/** 方言翻译 + 位置参数 ? → $1..$n（pg 驱动直连模式用） */
export function translateSql(sql: string): string {
  let out = translateDialect(sql);
  let n = 0;
  out = out.replace(/\?/g, () => `$${++n}`);
  return out;
}

type QueryLike = {
  query(sql: string, values?: readonly unknown[]): Promise<pg.QueryResult>;
};

/** 构造 D1 兼容的 meta 对象 */
function buildMeta(changes: number, lastRowId: number): D1Result['meta'] {
  return {
    changes,
    last_row_id: lastRowId,
    duration: 0,
    rows_read: 0,
    rows_written: changes,
    size_after: 0,
    changed_db: false,
  } as D1Result['meta'];
}

class PgStmt implements D1PreparedStatement {
  constructor(
    private readonly pool: pg.Pool,
    private readonly rawSql: string,
    private params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = [...this.params, ...values];
    return this as unknown as D1PreparedStatement;
  }

  /** 在指定连接上执行（batch 时复用同一连接以保持事务） */
  private async exec(client: QueryLike): Promise<pg.QueryResult> {
    return client.query(translateSql(this.rawSql), this.params);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const client = await this.pool.connect();
    try {
      const r = await this.exec(client);
      return {
        results: r.rows as unknown as T[],
        success: true,
        meta: buildMeta(r.rowCount ?? 0, 0),
      };
    } finally {
      client.release();
    }
  }

  async first<T = unknown>(col?: string): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      const r = await this.exec(client);
      const row = r.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return (col !== undefined ? row[col] : row) as T;
    } finally {
      client.release();
    }
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const client = await this.pool.connect();
    try {
      const r = await this.exec(client);
      // INSERT 语句：同连接取 lastval() 作为 last_row_id（无序列表会抛错，置 0）
      let lastRowId = 0;
      if (/^\s*INSERT\s/i.test(this.rawSql)) {
        try {
          const v = await client.query('SELECT lastval() AS id');
          lastRowId = Number((v.rows[0] as { id: number } | undefined)?.id ?? 0);
        } catch {
          // 复合主键等无序列的表：没有自增 id，保持 0
        }
      }
      return { results: [], success: true, meta: buildMeta(r.rowCount ?? 0, lastRowId) };
    } finally {
      client.release();
    }
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      const r = await this.exec(client);
      return r.rows as unknown[];
    } finally {
      client.release();
    }
  }

  /** batch 内部使用：在给定（事务）连接上执行 */
  async runOn(client: QueryLike): Promise<D1Result> {
    const r = await this.exec(client);
    let lastRowId = 0;
    if (/^\s*INSERT\s/i.test(this.rawSql)) {
      try {
        const v = await client.query('SELECT lastval() AS id');
        lastRowId = Number((v.rows[0] as { id: number } | undefined)?.id ?? 0);
      } catch {
        lastRowId = 0;
      }
    }
    return { results: [], success: true, meta: buildMeta(r.rowCount ?? 0, lastRowId) };
  }
}

export class PgD1 {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  prepare(query: string): D1PreparedStatement {
    return new PgStmt(this.pool, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: D1Result<T>[] = [];
      for (const s of statements) {
        const stmt = s as unknown as PgStmt;
        results.push((await stmt.runOn(client)) as D1Result<T>);
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
