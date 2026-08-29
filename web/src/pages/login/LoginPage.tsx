// 登录页：手机号 + 密码
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !password) {
      setError('请输入手机号和密码');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(phone.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl text-white">
            群
          </div>
          <h1 className="text-2xl font-bold text-ink">群芳教育管理系统</h1>
          <p className="mt-2 text-sm text-ink/60">排课 · 考勤 · 课时管理</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-ink">
            手机号
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-primary py-2.5 font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
