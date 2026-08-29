// RPC 版 D1 适配器：CloudBase 免费体验版没有数据库直连地址，
// 改走 PostgREST 网关调用数据库里的 exec_sql 函数（单次调用 = 单事务）。
// 业务代码依然是 c.env.DB.prepare(...).bind(...).all/first/run() 统一模式，零改动。
import type {
  D1PreparedStatement,
  D1Result,
} from '@cloudflare/workers-types';
import { translateDialect } from './pg-d1';

/** exec_sql 返回的单条语句结果 */
interface ExecItem {
  rows: Record<string, unknown>[];
  changes: number;
  last_row_id: number;
}

/** 把 JS 值转成 PostgreSQL 字面量（防注入：字符串单引号翻倍） */
function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`不支持的数字参数: ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  if (v instanceof Date) return `'${v.toISOString()}'`;
  throw new Error(`不支持的参数类型: ${typeof v}`);
}

/** 方言翻译 + 参数内联（? 按出现顺序替换为字面量） */
function buildSql(rawSql: string, params: unknown[]): string {
  let out = translateDialect(rawSql);
  let i = 0;
  out = out.replace(/\?/g, () => literal(params[i++]));
  if (i !== params.length) {
    throw new Error(`参数数量不匹配: SQL 需要 ${i} 个，实际给了 ${params.length} 个`);
  }
  return out;
}

/** 构造 D1 兼容的 meta 对象 */
function buildMeta(item: ExecItem): D1Result['meta'] {
  return {
    changes: item.changes,
    last_row_id: item.last_row_id,
    duration: 0,
    rows_read: 0,
    rows_written: item.changes,
    size_after: 0,
    changed_db: false,
  } as D1Result['meta'];
}

/** PostgREST RPC 客户端：调 exec_sql，返回每条语句的结果 */
export class RpcClient {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  async exec(sqls: string[]): Promise<ExecItem[]> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_sqls: sqls }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`数据库 RPC 调用失败(${res.status}): ${text.slice(0, 500)}`);
    }
    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body)) {
      throw new Error(`数据库 RPC 返回格式异常: ${text.slice(0, 500)}`);
    }
    return body as ExecItem[];
  }
}

class RpcStmt implements D1PreparedStatement {
  constructor(
    private readonly client: RpcClient,
    private readonly rawSql: string,
    private params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = [...this.params, ...values];
    return this as unknown as D1PreparedStatement;
  }

  /** 生成最终 SQL（batch 内部也用它拿每条语句的 SQL） */
  finalSql(): string {
    return buildSql(this.rawSql, this.params);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const [item] = await this.client.exec([this.finalSql()]);
    return {
      results: item.rows as unknown as T[],
      success: true,
      meta: buildMeta(item),
    };
  }

  async first<T = unknown>(col?: string): Promise<T | null> {
    const [item] = await this.client.exec([this.finalSql()]);
    const row = item.rows[0];
    if (!row) return null;
    return (col !== undefined ? row[col] : row) as T;
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const [item] = await this.client.exec([this.finalSql()]);
    return { results: [], success: true, meta: buildMeta(item) };
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(_options?: { columnNames?: boolean }): Promise<unknown[]> {
    const [item] = await this.client.exec([this.finalSql()]);
    return item.rows as unknown[];
  }
}

/** D1 API 的 RPC 实现：batch 把多条语句合成一次调用（天然同一事务） */
export class RpcD1 {
  constructor(
    envId: string,
    apiKey: string,
  ) {
    this.client = new RpcClient(
      `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/exec_sql`,
      apiKey,
    );
  }

  private readonly client: RpcClient;

  prepare(query: string): D1PreparedStatement {
    return new RpcStmt(this.client, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const sqls = statements.map((s) => (s as unknown as RpcStmt).finalSql());
    const items = await this.client.exec(sqls);
    // SELECT 语句 results 带行，DML 的 changes/last_row_id 在 meta 里
    return items.map((item) => ({
      results: item.rows as unknown as T[],
      success: true,
      meta: buildMeta(item),
    }));
  }
}
