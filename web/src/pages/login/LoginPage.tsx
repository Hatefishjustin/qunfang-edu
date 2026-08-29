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
    <div className="login-gradient flex min-h-screen flex-col px-6 py-12">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto mb-8 w-full max-w-sm">
          <span className="mb-4 inline-flex w-fit rounded-full bg-white/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-dark backdrop-blur-sm">
            群芳教育 · 管理系统
          </span>
          <h1 className="font-serif text-4xl font-normal leading-tight tracking-tight text-ink">
            记录每一次成长
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-tertiary">
            排课 · 考勤 · 课时管理，陪伴每一堂课。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-lg"
        >
          <label className="block text-sm font-semibold text-ink">
            手机号
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="input mt-2 h-12 px-4 text-base"
            />
          </label>

          <label className="mt-4 block text-sm font-semibold text-ink">
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="input mt-2 h-12 px-4 text-base"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-xl bg-error-soft px-3 py-2 text-sm text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-6 h-12 w-full text-base shadow-primary hover:-translate-y-0.5"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-muted">
          仅用于艺术培训机构内部管理
        </p>
      </div>
    </div>
  );
}
