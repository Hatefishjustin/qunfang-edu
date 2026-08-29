// JWT 工具：签发与校验（hono/jwt）
import { sign, verify } from 'hono/jwt';
import type { Role } from '../env';

export type JwtPayload = {
  uid: number;
  role: Role;
  campusId: number | null;
  /** 过期时间（Unix 秒） */
  exp: number;
};

/** 会话有效期：7 天 */
export const JWT_MAX_AGE_SECONDS = 7 * 24 * 3600;

/** 签发登录令牌（HS256） */
export async function signToken(
  payload: Omit<JwtPayload, 'exp'>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...payload, exp: now + JWT_MAX_AGE_SECONDS } satisfies JwtPayload, secret, 'HS256');
}

/** 校验令牌，失败返回 null */
export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    return (await verify(token, secret, 'HS256')) as JwtPayload;
  } catch {
    return null;
  }
}
