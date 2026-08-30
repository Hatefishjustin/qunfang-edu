#!/usr/bin/env node
// R8 冒烟：调课/请假审批、通知中心、课堂反馈老师独占权限
// 用法：node scripts/smoke-r8.mjs [baseUrl]
const base = process.argv[2] ?? 'http://127.0.0.1:8787';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function login(phone) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: 'Passw0rd!' }),
  });
  const cookie = /(?:^|;\s*)token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  return { status: res.status, cookie };
}

async function call(cookie, path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: `token=${cookie}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function isoDate(days = 0) {
  const date = new Date(Date.now() + days * 86400_000);
  const china = new Date(date.getTime() + 8 * 3600_000);
  return china.toISOString().slice(0, 10);
}

async function freeTenMinuteSlot(cookie, date, teacherId) {
  const response = await call(cookie, `/api/lessons?from=${date}&to=${date}`);
  const lessons = Array.isArray(response.data)
    ? response.data.filter((item) => item.teacher_id === teacherId)
    : [];
  const seed = Math.floor(Date.now() / 1000) % 72;
  for (let index = 0; index < 72; index++) {
    const startMinutes = 6 * 60 + ((seed + index) % 72) * 10;
    const endMinutes = startMinutes + 10;
    const start = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const overlaps = lessons.some((item) => start < item.end_time && end > item.start_time);
    if (!overlaps) return { start, end };
  }
  throw new Error(`找不到 ${date} 的空闲测试时段`);
}

const superAdmin = await login('13800000001');
const campusAdmin = await login('13800000002');
const parent = await login('13800000021');
const student = await login('13800000031');
const teacher = await login('13811100008');
const otherTeacher = await login('13811100002');
check('六个相关账号登录', [superAdmin, campusAdmin, parent, student, teacher, otherTeacher].every((item) => item.status === 200));

console.log('\n[1] 准备一节家长可见的明日测试课');
let r = await call(parent.cookie, `/api/me/lessons?from=${isoDate()}&to=${isoDate(30)}`);
const parentLessons = Array.isArray(r.data) ? r.data : [];
check('家长有未来课程', parentLessons.length > 0, `n=${parentLessons.length}`);
const source = parentLessons[0];
r = await call(superAdmin.cookie, `/api/lessons?from=${source.date}&to=${source.date}`);
const sourceAdmin = (Array.isArray(r.data) ? r.data : []).find((item) => item.id === source.id);
check('管理员能定位课程班级', Number.isInteger(sourceAdmin?.class_id));

const lessonDate = isoDate(1);
const initialSlot = await freeTenMinuteSlot(superAdmin.cookie, lessonDate, 9038);
const startTime = initialSlot.start;
const endTime = initialSlot.end;
r = await call(superAdmin.cookie, '/api/lessons', {
  method: 'POST',
  body: JSON.stringify({
    class_id: sourceAdmin.class_id,
    teacher_id: 9038,
    room_id: null,
    date: lessonDate,
    start_time: startTime,
    end_time: endTime,
    force: true,
    note: 'R8 冒烟测试课',
  }),
});
check('创建明日测试课', r.status === 201, JSON.stringify(r.data));
const lessonId = r.data?.id;
const studentId = source.student_id;

r = await call(teacher.cookie, '/api/notifications?limit=100');
check(
  '老师收到新增课程与课前提醒',
  r.status === 200 && r.data?.items?.some((item) => item.related_lesson_id === lessonId && item.type === 'lesson_created')
    && r.data?.items?.some((item) => item.related_lesson_id === lessonId && item.type === 'lesson_reminder'),
  JSON.stringify(r.data)?.slice(0, 300),
);

console.log('\n[2] 家长提交请假，排课老师批准');
r = await call(parent.cookie, '/api/schedule-requests', {
  method: 'POST',
  body: JSON.stringify({ lesson_id: lessonId, student_id: studentId, request_type: 'leave', reason: '孩子身体不适' }),
});
check('家长提交请假', r.status === 201, JSON.stringify(r.data));
const leaveRequestId = r.data?.id;

r = await call(parent.cookie, '/api/schedule-requests', {
  method: 'POST',
  body: JSON.stringify({ lesson_id: lessonId, student_id: studentId, request_type: 'leave', reason: '重复' }),
});
check('重复待审批申请被拒', r.status === 409, JSON.stringify(r.data));

r = await call(parent.cookie, '/api/schedule-requests', {
  method: 'POST',
  body: JSON.stringify({ lesson_id: lessonId, student_id: 99999999, request_type: 'leave', reason: '越权' }),
});
check('家长不能替无关联学员申请', r.status === 403, JSON.stringify(r.data));

r = await call(campusAdmin.cookie, '/api/notifications?limit=100');
check('排课老师收到待审批通知', r.data?.items?.some((item) => item.related_request_id === leaveRequestId));

r = await call(campusAdmin.cookie, `/api/schedule-requests/${leaveRequestId}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ action: 'approve', review_note: '已登记请假' }),
});
check('排课老师批准请假', r.status === 200 && r.data?.status === 'approved', JSON.stringify(r.data));

r = await call(campusAdmin.cookie, `/api/lessons/${lessonId}/attendance`);
const leaveAttendance = r.data?.students?.find((item) => item.id === studentId)?.attendance;
check('请假已预置到点名且未扣课', leaveAttendance?.status === 'leave' && leaveAttendance?.deducted === 0, JSON.stringify(leaveAttendance));

r = await call(parent.cookie, '/api/notifications?limit=100');
const approvalNotice = r.data?.items?.find((item) => item.related_request_id === leaveRequestId && item.type === 'request_approved');
check('家长收到批准结果', Boolean(approvalNotice));
const unreadBefore = r.data?.unread_count ?? 0;
if (approvalNotice) {
  const readResult = await call(parent.cookie, `/api/notifications/${approvalNotice.id}/read`, { method: 'PATCH', body: '{}' });
  check('单条通知可标记已读', readResult.status === 200);
  const afterRead = await call(parent.cookie, '/api/notifications?limit=100');
  check('未读数即时减少', afterRead.data?.unread_count === Math.max(0, unreadBefore - 1));
}

console.log('\n[3] 家长提交调课，审批后修改课表');
const requestedDate = isoDate(10);
const requestedSlot = await freeTenMinuteSlot(superAdmin.cookie, requestedDate, 9038);
r = await call(parent.cookie, '/api/schedule-requests', {
  method: 'POST',
  body: JSON.stringify({
    lesson_id: lessonId,
    student_id: studentId,
    request_type: 'reschedule',
    reason: '原时间与学校活动冲突',
    requested_date: requestedDate,
    requested_start: requestedSlot.start,
    requested_end: requestedSlot.end,
  }),
});
check('家长提交调课', r.status === 201, JSON.stringify(r.data));
const rescheduleRequestId = r.data?.id;
r = await call(campusAdmin.cookie, `/api/schedule-requests/${rescheduleRequestId}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ action: 'approve', review_note: '时间无冲突' }),
});
check('排课老师批准调课', r.status === 200 && r.data?.status === 'approved', JSON.stringify(r.data));
r = await call(parent.cookie, `/api/schedule-requests`);
const rescheduled = (Array.isArray(r.data) ? r.data : []).find((item) => item.id === rescheduleRequestId);
check(
  '课程时间按申请更新',
  rescheduled?.status === 'approved'
    && rescheduled?.lesson_date === requestedDate
    && rescheduled?.lesson_start === requestedSlot.start
    && rescheduled?.lesson_end === requestedSlot.end,
  JSON.stringify(rescheduled),
);

console.log('\n[4] 课堂反馈图片和留言仅老师可输入');
r = await call(parent.cookie, `/api/lessons/${lessonId}/note`, {
  method: 'PATCH', body: JSON.stringify({ note: '家长代写' }),
});
check('家长不能写课堂内容', r.status === 403);
r = await call(campusAdmin.cookie, `/api/lessons/${lessonId}/comments`, {
  method: 'POST', body: JSON.stringify({ content: '管理员代写' }),
});
check('管理员不能写课堂留言', r.status === 403);

r = await call(teacher.cookie, `/api/lessons/${lessonId}/note`, {
  method: 'PATCH', body: JSON.stringify({ note: '完成色彩观察练习，课堂状态良好' }),
});
check('本节课老师可写课堂内容', r.status === 200, JSON.stringify(r.data));
const png1px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await call(teacher.cookie, `/api/lessons/${lessonId}/files`, {
  method: 'POST', body: JSON.stringify({ mime: 'image/png', data: png1px }),
});
check('本节课老师可上传图片', r.status === 201, JSON.stringify(r.data));
const fileId = r.data?.id;
r = await call(otherTeacher.cookie, `/api/lessons/${lessonId}/files/${fileId}`, { method: 'DELETE' });
check('非本节课老师不能删除课堂图片', r.status === 403, JSON.stringify(r.data));
r = await call(teacher.cookie, `/api/lessons/${lessonId}/comments`, {
  method: 'POST', body: JSON.stringify({ content: '请课后完成一张配色练习。' }),
});
check('本节课老师可发布留言', r.status === 201, JSON.stringify(r.data));

r = await call(parent.cookie, `/api/lessons/${lessonId}/content`);
check(
  '家长只读查看文字、图片和老师留言',
  r.status === 200 && r.data?.can_edit === false
    && r.data?.lesson?.note?.includes('色彩观察')
    && r.data?.files?.some((item) => item.id === fileId)
    && r.data?.comments?.some((item) => item.content?.includes('配色练习')),
  JSON.stringify(r.data)?.slice(0, 300),
);
r = await call(parent.cookie, `/api/lessons/${lessonId}/comments`, {
  method: 'POST', body: JSON.stringify({ content: '家长回复' }),
});
check('家长不能发布课堂留言', r.status === 403);
const image = await fetch(`${base}/api/lessons/files/${fileId}`, { headers: { Cookie: `token=${parent.cookie}` } });
check('家长可正常读取课堂图片', image.status === 200 && image.headers.get('content-type') === 'image/png');

r = await call(parent.cookie, '/api/notifications?limit=100');
check('家长收到课堂反馈通知', r.data?.items?.some((item) => item.related_lesson_id === lessonId && item.type === 'classroom_feedback'));
r = await call(parent.cookie, '/api/notifications/read-all', { method: 'POST', body: '{}' });
check('全部标记已读', r.status === 200);
r = await call(parent.cookie, '/api/notifications?limit=100');
check('全部已读后未读数为 0', r.data?.unread_count === 0, String(r.data?.unread_count));

// 学生端接口至少可访问通知；具体数据按滨江账号自身课程生成。
r = await call(student.cookie, '/api/notifications?limit=10');
check('学生端通知接口可用', r.status === 200 && Array.isArray(r.data?.items));

if (lessonId) {
  await call(superAdmin.cookie, `/api/lessons/${lessonId}`, { method: 'DELETE' });
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
