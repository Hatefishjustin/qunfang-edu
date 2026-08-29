// 课堂内容弹窗：老师端录入本节课内容（文字+图片），家长/学生查看并留言交流
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { useToast } from './Toast';
import Modal from './Modal';
import { ROLE_LABELS } from '../types';
import type { LessonContentData, Role } from '../types';
import { compressImage, fmtSize } from '../util/image';
import { fmtCN, weekdayOf } from '../util/date';
import { WEEKDAY_NAMES } from '../types';

const MAX_FILES = 9;

/** 留言者角色 → 展示标签（老师蓝 / 家长学生灰 / 管理员绿） */
function roleBadge(role: Role): { label: string; cls: string } {
  if (role === 'teacher') return { label: ROLE_LABELS.teacher, cls: 'bg-primary-light/30 text-primary' };
  if (role === 'campus_admin' || role === 'super_admin') {
    return { label: ROLE_LABELS[role], cls: 'bg-emerald-100 text-emerald-700' };
  }
  return { label: ROLE_LABELS[role], cls: 'bg-black/5 text-ink/60' };
}

export default function LessonContentModal({
  lessonId,
  onClose,
}: {
  lessonId: number;
  onClose: () => void;
}) {
  const { data, loading, error, reload } = useApiData<LessonContentData>(
    `/api/lessons/${lessonId}/content`,
  );
  const { showToast } = useToast();

  // 文字内容编辑（can_edit 时）
  const [note, setNote] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  // 图片上传
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // 留言
  const [comment, setComment] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  const lesson = data?.lesson;
  const noteValue = note ?? lesson?.note ?? '';

  async function saveNote() {
    if (!data) return;
    const text = noteValue.trim();
    if (text.length > 2000) {
      showToast('课堂内容最多 2000 字', 'error');
      return;
    }
    setNoteSaving(true);
    try {
      await api.patch(`/api/lessons/${lessonId}/note`, { note: text });
      showToast('课堂内容已保存');
      setNote(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setNoteSaving(false);
    }
  }

  async function uploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !data) return;
    if (data.files.length >= MAX_FILES) {
      showToast(`每节课最多 ${MAX_FILES} 张图片`, 'error');
      return;
    }
    setUploading(true);
    try {
      const img = await compressImage(file);
      await api.post(`/api/lessons/${lessonId}/files`, img);
      showToast('图片已上传');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(fileId: number) {
    if (!window.confirm('确定删除这张图片吗？')) return;
    try {
      await api.del(`/api/lessons/${lessonId}/files/${fileId}`);
      showToast('图片已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    setCommentSending(true);
    try {
      await api.post(`/api/lessons/${lessonId}/comments`, { content: text });
      setComment('');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '发送失败', 'error');
    } finally {
      setCommentSending(false);
    }
  }

  return (
    <Modal title="课堂内容" onClose={onClose}>
      {loading && <p className="text-sm text-ink/50">加载中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && lesson && (
        <div className="space-y-5 text-sm">
          {/* 课信息 */}
          <div className="rounded-lg bg-primary-bg p-3">
            <p className="font-medium text-ink">
              {lesson.course_name ?? lesson.class_name ?? '未命名课'}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {fmtCN(lesson.date)} {WEEKDAY_NAMES[weekdayOf(lesson.date)]} {lesson.start_time}–
              {lesson.end_time}
              {lesson.teacher_name ? ` · ${lesson.teacher_name}` : ''}
              {lesson.room_name ? ` · ${lesson.room_name}` : ''}
            </p>
          </div>

          {/* 文字内容 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-medium text-ink">本节课内容</p>
              {data.can_edit && (
                <button
                  onClick={() => void saveNote()}
                  disabled={noteSaving || note === null}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {noteSaving ? '保存中…' : '保存'}
                </button>
              )}
            </div>
            {data.can_edit ? (
              <textarea
                value={noteValue}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="记录本节课学习内容、课堂表现、课后作业等…"
                className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : noteValue ? (
              <p className="whitespace-pre-wrap rounded-lg border border-black/5 px-3 py-2 text-ink/80">
                {noteValue}
              </p>
            ) : (
              <p className="rounded-lg border border-dashed border-black/10 px-3 py-2 text-xs text-ink/40">
                老师还没有录入本节课内容
              </p>
            )}
          </div>

          {/* 图片 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-medium text-ink">课堂图片（{data.files.length}）</p>
              {data.can_edit && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || data.files.length >= MAX_FILES}
                    className="rounded-lg border border-black/10 px-3 py-1 text-xs text-ink/70 hover:bg-black/5 disabled:opacity-50"
                  >
                    {uploading ? '上传中…' : '+ 上传图片'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void uploadFile(e)}
                  />
                </>
              )}
            </div>
            {data.files.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 px-3 py-2 text-xs text-ink/40">
                {data.can_edit ? '还没有图片，点击「上传图片」添加（自动压缩，单张 ≤ 400KB）' : '暂无课堂图片'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {data.files.map((f) => (
                  <div key={f.id} className="group relative">
                    <a
                      href={`/api/lessons/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-black/5"
                    >
                      <img
                        src={`/api/lessons/files/${f.id}`}
                        alt="课堂图片"
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                    <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white">
                      {fmtSize(f.size)}
                    </span>
                    {data.can_edit && (
                      <button
                        onClick={() => void deleteFile(f.id)}
                        className="absolute right-1 top-1 hidden rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 师生留言 */}
          <div>
            <p className="mb-1.5 font-medium text-ink">留言交流（{data.comments.length}）</p>
            {data.comments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 px-3 py-2 text-xs text-ink/40">
                还没有留言，有问题可以在这里向老师提问
              </p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {data.comments.map((cm) => {
                  const badge = roleBadge(cm.role);
                  return (
                    <li key={cm.id} className="rounded-lg border border-black/5 px-3 py-2">
                      <p className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{cm.user_name ?? '已注销用户'}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="ml-auto text-[10px] text-ink/40">
                          {cm.created_at.slice(5, 16)}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-ink/80">{cm.content}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendComment();
                }}
                maxLength={500}
                placeholder={data.can_edit ? '回复家长/学生…' : '给老师留言…'}
                className="flex-1 rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => void sendComment()}
                disabled={commentSending || !comment.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {commentSending ? '发送中…' : '发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
