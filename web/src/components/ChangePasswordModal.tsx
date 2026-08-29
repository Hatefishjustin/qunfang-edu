// 修改密码：按钮 + 弹窗（任意登录角色可用，PATCH /api/auth/password）
import { useState } from 'react';
import Modal from './Modal';
import { useToast } from './Toast';
import { api, ApiError } from '../api/client';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!oldPassword || !newPassword || !confirm) {
      showToast('请填写完整', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码至少 6 位', 'error');
      return;
    }
    if (newPassword !== confirm) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/auth/password', { oldPassword, newPassword });
      showToast('密码已修改');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '网络异常，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="修改密码" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm font-medium text-ink-secondary">
          旧密码
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="input mt-1.5"
            placeholder="请输入当前密码"
          />
        </label>
        <label className="block text-sm font-medium text-ink-secondary">
          新密码
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input mt-1.5"
            placeholder="至少 6 位"
          />
        </label>
        <label className="block text-sm font-medium text-ink-secondary">
          确认新密码
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input mt-1.5"
            placeholder="再输入一次新密码"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 各布局头部通用按钮：点击弹出修改密码窗口 */
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary px-3 py-1.5 text-xs">
        改密
      </button>
      {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
    </>
  );
}
