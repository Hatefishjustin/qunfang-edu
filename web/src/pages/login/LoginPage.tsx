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
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl text-white shadow-lg shadow-primary/25">
            群
          </div>
          <h1 className="text-2xl font-bold text-ink">群芳教育管理系统</h1>
          <p className="mt-2 text-sm text-ink-tertiary">排课 · 考勤 · 课时管理</p>
        </div>

        <form onSubmit={handleSubmit} className="card-elevated p-6">
          <label className="block text-sm font-medium text-ink-secondary">
            手机号
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="input mt-1.5 text-base"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink-secondary">
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="input mt-1.5 text-base"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-xl bg-error-soft px-3 py-2 text-sm text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-6 w-full py-2.5 text-base"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
