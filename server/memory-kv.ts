// 内存 KV：替代 Cloudflare KV（仅用于登录失败计数，重启清零无碍）
// 带 TTL 的极简实现，只提供业务代码实际用到的 get/put/delete
export class MemoryKv {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    this.store.set(key, {
      value,
      expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
