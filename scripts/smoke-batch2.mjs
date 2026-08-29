// 需求批次 2 冒烟测试：学员状态 / 跟进记录 / 课堂内容（文字+图片+留言）
// 用法：node scripts/smoke-batch2.mjs [base]
const base = process.argv[2] ?? 'http://127.0.0.1:8787';

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function jfetch(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${loginCookie}`,
      ...(init.headers ?? {}),
    },
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

// ---------- 登录（super_admin） ----------
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800000001', password: 'Passw0rd!' }),
});
const loginCookie =
  (/(?:^|;\s*)token=([^;]+)/.exec(login.headers.get('set-cookie') ?? '')?.[1] ?? '');
ok('登录 super_admin', login.status === 200 && loginCookie !== '');

console.log('\n===== 需求1：学员状态（在读/待开发）=====');

// 建一个学员（不带 status，默认 active）
let r = await jfetch('/api/students', {
  method: 'POST',
  body: JSON.stringify({ name: '测试-默认状态', campus_id: 901 }),
});
ok('新建学员默认在读', r.status === 201, JSON.stringify(r.data));
const sidDefault = r.data?.id;

// 建一个待开化学员
r = await jfetch('/api/students', {
  method: 'POST',
  body: JSON.stringify({ name: '测试-待开发学员', campus_id: 901, status: 'prospect' }),
});
ok('新建学员可指定待开发', r.status === 201, JSON.stringify(r.data));
const sidProspect = r.data?.id;

// 列表：全部
r = await jfetch('/api/students?campus_id=901');
const listAll = Array.isArray(r.data) ? r.data : [];
ok('列表含 status 字段', listAll.length > 0 && 'status' in listAll[0]);
ok('列表含 last_followup 字段', listAll.length > 0 && 'last_followup' in listAll[0]);

// 列表：筛选 prospect
r = await jfetch('/api/students?campus_id=901&status=prospect');
const listProspect = Array.isArray(r.data) ? r.data : [];
ok(
  '筛选待开发：只含 prospect',
  r.status === 200 && listProspect.every((s) => s.status === 'prospect') && listProspect.length > 0,
  `n=${listProspect.length}`,
);

// 列表：筛选 active
r = await jfetch('/api/students?campus_id=901&status=active');
const listActive = Array.isArray(r.data) ? r.data : [];
ok(
  '筛选在读：只含 active',
  r.status === 200 && listActive.every((s) => s.status === 'active') && listActive.length > 0,
  `n=${listActive.length}`,
);

// 修改状态
r = await jfetch(`/api/students/${sidProspect}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'active' }),
});
ok('待开发 → 在读', r.status === 200, JSON.stringify(r.data));

// 非法状态拒绝
r = await jfetch(`/api/students/${sidProspect}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'xxx' }),
});
ok('非法状态 400', r.status === 400, JSON.stringify(r.data));

console.log('\n===== 需求2：咨询师跟进记录 =====');

// 非法：缺内容
r = await jfetch(`/api/students/${sidDefault}/followups`, {
  method: 'POST',
  body: JSON.stringify({ contact_time: '2026-08-29 10:00', content: '' }),
});
ok('空内容 400', r.status === 400, JSON.stringify(r.data));

// 非法：时间格式
r = await jfetch(`/api/students/${sidDefault}/followups`, {
  method: 'POST',
  body: JSON.stringify({ contact_time: '昨天', content: 'x' }),
});
ok('非法时间 400', r.status === 400, JSON.stringify(r.data));

// 正常新增（datetime-local 格式）
r = await jfetch(`/api/students/${sidDefault}/followups`, {
  method: 'POST',
  body: JSON.stringify({
    contact_time: '2026-08-28T14:30',
    content: '电话回访，家长对周末美术班感兴趣，约定下周试听',
    next_time: '2026-09-02',
  }),
});
ok('新增跟进记录', r.status === 201, JSON.stringify(r.data));

// 再来一条（不带下次跟进）
r = await jfetch(`/api/students/${sidDefault}/followups`, {
  method: 'POST',
  body: JSON.stringify({ contact_time: '2026-08-29 09:00', content: '微信跟进：发送课程介绍' }),
});
ok('新增第二条跟进', r.status === 201, JSON.stringify(r.data));

// 详情含跟进列表
r = await jfetch(`/api/students/${sidDefault}`);
const detail = r.data ?? {};
ok('详情返回 followups 数组', Array.isArray(detail.followups) && detail.followups.length >= 2);
ok('详情含跟进人姓名', detail.followups?.some((f) => f.follower_name === '超级管理员'));
ok(
  '联系时间已规范为空格分隔',
  detail.followups?.some((f) => f.contact_time === '2026-08-28 14:30' && f.next_time === '2026-09-02'),
);

// 列表 last_followup 联动
r = await jfetch('/api/students?campus_id=901');
const row = (Array.isArray(r.data) ? r.data : []).find((s) => s.id === sidDefault);
ok('列表最近跟进时间联动', row?.last_followup === '2026-08-29 09:00', String(row?.last_followup));

// 不存在的学员
r = await jfetch('/api/students/99999999/followups', {
  method: 'POST',
  body: JSON.stringify({ contact_time: '2026-08-29 09:00', content: 'x' }),
});
ok('学员不存在 404', r.status === 404, JSON.stringify(r.data));

console.log('\n===== 需求3：课堂内容（文字+图片+留言）=====');

// 取一节课（super_admin 视角，任意校区的第一节课）
r = await jfetch('/api/lessons?from=2026-08-01&to=2026-12-31');
const lessons = Array.isArray(r.data) ? r.data : [];
ok('拿到课列表', lessons.length > 0, 'n=0');
const lesson = lessons[0];
const lessonId = lesson?.id;

// 内容详情
r = await jfetch(`/api/lessons/${lessonId}/content`);
ok('内容详情 200', r.status === 200, JSON.stringify(r.data)?.slice(0, 120));
ok('详情含 can_edit=true（super_admin）', r.data?.can_edit === true);
ok('详情含 files/comments 数组', Array.isArray(r.data?.files) && Array.isArray(r.data?.comments));

// 修改内容
r = await jfetch(`/api/lessons/${lessonId}/note`, {
  method: 'PATCH',
  body: JSON.stringify({ note: '本节课：素描静物入门，练习排线与明暗' }),
});
ok('保存课堂内容', r.status === 200, JSON.stringify(r.data));

r = await jfetch(`/api/lessons/${lessonId}/content`);
ok('内容已保存', r.data?.lesson?.note === '本节课：素描静物入门，练习排线与明暗');

// 超长内容拒绝
r = await jfetch(`/api/lessons/${lessonId}/note`, {
  method: 'PATCH',
  body: JSON.stringify({ note: 'x'.repeat(2001) }),
});
ok('超长内容 400', r.status === 400, JSON.stringify(r.data));

// 上传图片（1x1 红色 PNG，很小）
const png1px =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await jfetch(`/api/lessons/${lessonId}/files`, {
  method: 'POST',
  body: JSON.stringify({ mime: 'image/png', data: png1px }),
});
ok('上传图片', r.status === 201, JSON.stringify(r.data));
const fileId = r.data?.id;

// 非图片 mime 拒绝
r = await jfetch(`/api/lessons/${lessonId}/files`, {
  method: 'POST',
  body: JSON.stringify({ mime: 'text/plain', data: 'aGVsbG8=' }),
});
ok('非图片 400', r.status === 400, JSON.stringify(r.data));

// 内容详情含图片
r = await jfetch(`/api/lessons/${lessonId}/content`);
ok('详情含图片列表', r.data?.files?.some((f) => f.id === fileId));

// 读图片二进制
const imgRes = await fetch(`${base}/api/lessons/files/${fileId}`, {
  headers: { Cookie: `token=${loginCookie}` },
});
const imgBuf = await imgRes.arrayBuffer();
ok(
  '读取图片返回二进制',
  imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/png' && imgBuf.byteLength > 50,
  `status=${imgRes.status} type=${imgRes.headers.get('content-type')} len=${imgBuf.byteLength}`,
);

// 留言（super_admin）
r = await jfetch(`/api/lessons/${lessonId}/comments`, {
  method: 'POST',
  body: JSON.stringify({ content: '今天孩子状态不错，排线进步明显' }),
});
ok('发布留言', r.status === 201, JSON.stringify(r.data));

// 空留言拒绝
r = await jfetch(`/api/lessons/${lessonId}/comments`, {
  method: 'POST',
  body: JSON.stringify({ content: '   ' }),
});
ok('空留言 400', r.status === 400, JSON.stringify(r.data));

// 留言出现在详情
r = await jfetch(`/api/lessons/${lessonId}/content`);
ok('留言已入库', r.data?.comments?.some((c) => c.content?.includes('排线进步明显')));
ok(
  '留言带角色与姓名',
  r.data?.comments?.some((c) => c.role === 'super_admin' && c.user_name === '超级管理员'),
);

// 删除图片
r = await jfetch(`/api/lessons/${lessonId}/files/${fileId}`, { method: 'DELETE' });
ok('删除图片', r.status === 200, JSON.stringify(r.data));
r = await jfetch(`/api/lessons/${lessonId}/content`);
ok('图片已从列表移除', !(r.data?.files ?? []).some((f) => f.id === fileId));

console.log('\n===== 权限校验：家长/学生视角 =====');

// 家长登录（阳光广场，2 个孩子）
const plogin = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800000021', password: 'Passw0rd!' }),
});
const parentCookie = (/(?:^|;\s*)token=([^;]+)/.exec(plogin.headers.get('set-cookie') ?? '')?.[1] ?? '');
ok('家长登录', plogin.status === 200 && parentCookie !== '');

async function pfetch(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${parentCookie}`,
      ...(init.headers ?? {}),
    },
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

// 家长的课
r = await pfetch('/api/me/lessons?from=2026-08-01&to=2026-12-31');
const myLessons = Array.isArray(r.data) ? r.data : [];
ok('家长能拿到自己的课', myLessons.length > 0, 'n=0');
const myLessonId = myLessons[0]?.id;

// 家长看自己课的内容：可以
r = await pfetch(`/api/lessons/${myLessonId}/content`);
ok('家长可查看自己课内容', r.status === 200 && r.data?.can_edit === false, JSON.stringify(r.data)?.slice(0, 100));

// 家长改内容：403
r = await pfetch(`/api/lessons/${myLessonId}/note`, {
  method: 'PATCH',
  body: JSON.stringify({ note: '家长篡改' }),
});
ok('家长改内容 403', r.status === 403, JSON.stringify(r.data));

// 家长传图：403
r = await pfetch(`/api/lessons/${myLessonId}/files`, {
  method: 'POST',
  body: JSON.stringify({ mime: 'image/png', data: png1px }),
});
ok('家长传图 403', r.status === 403, JSON.stringify(r.data));

// 家长留言：可以
r = await pfetch(`/api/lessons/${myLessonId}/comments`, {
  method: 'POST',
  body: JSON.stringify({ content: '老师好，请问这节课的作业是什么？' }),
});
ok('家长可留言', r.status === 201, JSON.stringify(r.data));

// 家长看别人校区课的内容：403（lesson 是阳光广场，家长 9051 也在阳光广场，这里改用一个不存在关联的课——用上面 lessonId 若同校区则跳过该校验）
if (lessonId !== myLessonId) {
  // lessonId 可能也在阳光广场：先查它校区
  const lr = await jfetch(`/api/lessons/${lessonId}/content`);
  if (lr.status === 200) {
    const r2 = await pfetch(`/api/lessons/${lessonId}/content`);
    // 该课若属于家长可看范围则 200，否则 403——只断言不是 500
    ok('家长访问任意课不 500', r2.status === 200 || r2.status === 403, `status=${r2.status}`);
  }
}

console.log(`\n===== 结果：${passed} 通过 / ${failed} 失败 =====`);
process.exit(failed > 0 ? 1 : 0);
