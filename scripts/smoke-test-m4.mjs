#!/usr/bin/env node
// M4 冒烟自测：排课核心 —— 三类冲突检测 + 单次/批量建课 + 调课/取消 + 总览渲染 + 权限
// 用法：node scripts/smoke-test-m4.mjs [baseUrl]（默认 http://127.0.0.1:8787）
const base = process.argv[2] ?? 'http://127.0.0.1:8787';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function login(phone, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const cookie = /(?:^|;\s*)token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  return { res, cookie };
}

function F(cookie, path, init = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: `token=${cookie}`, ...(init.headers ?? {}) },
  });
}

// ---------- 本地日期工具（与系统约定一致：YYYY-MM-DD） ----------
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function weekdayOf(date) {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}

async function main() {
  const suffix = String(Date.now()).slice(-7);
  // 测试基准：下周一（所有课都排在下周，避免和本周数据纠缠）
  const today = toISO(new Date());
  const nextMonday = addDays(today, ((0 - weekdayOf(today) + 7) % 7) || 7);

  console.log('[准备] super_admin 登录');
  const sa = await login('13800000001', 'Passw0rd!');
  const saCookie = sa.cookie;
  check('super_admin 登录', sa.res.status === 200);

  // ---------- 基础数据 ----------
  console.log('[1] 准备校区/教师/教室/班级');
  const campusId = (
    await (
      await F(saCookie, '/api/campuses', { method: 'POST', body: JSON.stringify({ name: `M4校区${suffix}` }) })
    ).json()
  ).id;

  const t1 = await (
    await F(saCookie, '/api/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: '老师甲', phone: `137${suffix}01`, campus_id: campusId, subject: '美术' }),
    })
  ).json();
  const t2 = await (
    await F(saCookie, '/api/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: '老师乙', phone: `137${suffix}02`, campus_id: campusId, subject: '书法' }),
    })
  ).json();
  check('建 2 位教师', !!t1.id && !!t2.id);

  const room = await (
    await F(saCookie, '/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: `M4画室${suffix}`, campus_id: campusId, capacity: 10 }),
    })
  ).json();
  const course = await (
    await F(saCookie, '/api/courses', {
      method: 'POST',
      body: JSON.stringify({ name: `M4美术课${suffix}`, campus_id: campusId }),
    })
  ).json();
  const cls = await (
    await F(saCookie, '/api/classes', {
      method: 'POST',
      body: JSON.stringify({ name: `M4班${suffix}`, course_id: course.id, head_teacher_id: t1.id, campus_id: campusId }),
    })
  ).json();
  const cls2 = await (
    await F(saCookie, '/api/classes', {
      method: 'POST',
      body: JSON.stringify({ name: `M4班2${suffix}`, course_id: course.id, head_teacher_id: t2.id, campus_id: campusId }),
    })
  ).json();
  check('建教室/课程/2 个班级', !!room.id && !!course.id && !!cls.id && !!cls2.id);

  // ---------- unavailable 冲突 + force ----------
  console.log('[2] unavailable 冲突（老师申报不可上课）');
  await F(saCookie, `/api/teachers/${t1.id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({
      rules: [{ weekday: weekdayOf(nextMonday), start_time: '09:00', end_time: '12:00', kind: 'unavailable' }],
    }),
  });

  const inUnavailable = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, room_id: room.id, date: nextMonday, start_time: '10:00', end_time: '11:30' }),
  });
  check('落在不可用时段 → 拒绝（409）', inUnavailable.status === 409, `${inUnavailable.status}`);

  const forced = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, room_id: room.id, date: nextMonday, start_time: '10:00', end_time: '11:30', force: true }),
  });
  const forcedBody = await forced.json();
  check('force=true 放行', forced.status === 201, `${forced.status}`);

  const forcedLessons = await F(saCookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 6)}&teacher_id=${t1.id}`).then((r) => r.json());
  const forcedLesson = forcedLessons.find((l) => l.start_time === '10:00');
  check('force 例外记入 note', (forcedLesson?.note ?? '').includes('强制排课'), JSON.stringify(forcedLesson?.note));

  // ---------- 老师重叠冲突 ----------
  console.log('[3] 老师重叠冲突');
  const normal = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, room_id: room.id, date: nextMonday, start_time: '14:00', end_time: '15:30' }),
  });
  check('正常建课（14:00–15:30）', normal.status === 201, `${normal.status}`);

  const teacherOverlap = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t1.id, date: nextMonday, start_time: '15:00', end_time: '16:30' }),
  });
  check('同老师时间重叠 → 拒绝（409）', teacherOverlap.status === 409, `${teacherOverlap.status}`);

  const forceHard = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t1.id, date: nextMonday, start_time: '15:00', end_time: '16:30', force: true }),
  });
  check('force 不能跳过老师硬冲突', forceHard.status === 409, `${forceHard.status}`);

  // ---------- 教室重叠冲突 ----------
  console.log('[4] 教室重叠冲突');
  const roomOverlap = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t2.id, room_id: room.id, date: nextMonday, start_time: '14:30', end_time: '16:00' }),
  });
  check('同教室时间重叠 → 拒绝（409）', roomOverlap.status === 409, `${roomOverlap.status}`);

  const roomOk = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t2.id, date: nextMonday, start_time: '16:30', end_time: '18:00' }),
  });
  check('错开教室时段 → 成功', roomOk.status === 201, `${roomOk.status}`);

  // ---------- 按周批量建课 ----------
  console.log('[5] 按周批量建课 16 周');
  const batch = await F(saCookie, '/api/lessons/batch', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t2.id, weekday: 2, start_time: '16:00', end_time: '17:30', start_date: nextMonday, weeks: 16 }),
  });
  const batchBody = await batch.json();
  check('批量建 16 节课', batch.status === 201 && batchBody.created === 16, `${batch.status} ${JSON.stringify(batchBody)}`);

  const t2Lessons = await F(saCookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 120)}&teacher_id=${t2.id}`).then((r) => r.json());
  check('课表查询 T2 = 17 节（批量 16 + 单节）', t2Lessons.length === 17, `实际 ${t2Lessons.length}`);

  // ---------- 批量冲突整体回滚 ----------
  console.log('[6] 批量冲突整体回滚');
  const beforeCount = (await F(saCookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 120)}&teacher_id=${t1.id}`).then((r) => r.json())).length;
  const badBatch = await F(saCookie, '/api/lessons/batch', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, weekday: 0, start_time: '13:00', end_time: '14:30', start_date: nextMonday, weeks: 4 }),
  });
  const badBody = await badBatch.json().catch(() => null);
  check('批量第 1 周撞老师已有课 → 拒绝（409）', badBatch.status === 409 && (badBody?.error ?? '').includes('第 1 周'), `${badBatch.status} ${JSON.stringify(badBody)}`);
  const afterCount = (await F(saCookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 120)}&teacher_id=${t1.id}`).then((r) => r.json())).length;
  check('整体回滚：一条都没插入', afterCount === beforeCount, `${beforeCount} → ${afterCount}`);

  // ---------- 忙闲总览 ----------
  console.log('[7] 忙闲总览渲染数据');
  const overview = await F(saCookie, `/api/schedule/overview?week_start=${nextMonday}&campus_id=${campusId}`).then((r) => r.json());
  const ovT1 = overview.teachers?.find((t) => t.id === t1.id);
  const ovT2 = overview.teachers?.find((t) => t.id === t2.id);
  check('总览含 2 位教师', overview.teachers?.length === 2, JSON.stringify(overview.teachers?.map((t) => t.name)));
  check('T1 规则已带上（unavailable）', ovT1?.rules?.length === 1 && ovT1.rules[0].kind === 'unavailable');
  check('T1 本周 2 节课', ovT1?.lessons?.length === 2, `实际 ${ovT1?.lessons?.length}`);
  check('T2 本周 2 节课（批量首节 + 单节）', ovT2?.lessons?.length === 2, `实际 ${ovT2?.lessons?.length}`);
  const week3 = addDays(nextMonday, 14);
  const overview3 = await F(saCookie, `/api/schedule/overview?week_start=${week3}&campus_id=${campusId}`).then((r) => r.json());
  const ov3T2 = overview3.teachers?.find((t) => t.id === t2.id);
  check('第 3 周总览：T2 仍有 1 节批量课', ov3T2?.lessons?.length === 1, `实际 ${ov3T2?.lessons?.length}`);

  // ---------- 调课 / 取消 ----------
  console.log('[8] 调课与取消');
  const lessonId = t2Lessons[0].id;
  const patchOk = await F(saCookie, `/api/lessons/${lessonId}`, {
    method: 'PATCH',
    body: JSON.stringify({ start_time: '16:00', end_time: '17:30' }),
  });
  check('调课成功', patchOk.status === 200, `${patchOk.status}`);

  const patchConflict = await F(saCookie, `/api/lessons/${lessonId}`, {
    method: 'PATCH',
    body: JSON.stringify({ date: addDays(nextMonday, 2), start_time: '16:00', end_time: '17:30' }),
  });
  check('调到冲突时段 → 拒绝（409）', patchConflict.status === 409, `${patchConflict.status}`);

  const del = await F(saCookie, `/api/lessons/${lessonId}`, { method: 'DELETE' });
  check('取消课成功', del.status === 200, `${del.status}`);
  const delAgain = await F(saCookie, `/api/lessons/${lessonId}`, { method: 'DELETE' });
  check('重复取消 → 报错', delAgain.status === 400, `${delAgain.status}`);
  const t2After = await F(saCookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 120)}&teacher_id=${t2.id}`).then((r) => r.json());
  check('取消后课表不再显示（16 节）', t2After.length === 16, `实际 ${t2After.length}`);

  // ---------- teacher 权限 ----------
  console.log('[9] teacher 权限');
  const t1Login = await login(`137${suffix}01`, 'Passw0rd!');
  const t1Lessons = await F(t1Login.cookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 6)}`).then((r) => r.json());
  check('教师只见自己的课', t1Lessons.length === 2 && t1Lessons.every((l) => l.teacher_id === t1.id), `实际 ${t1Lessons.length}`);
  const t1Post = await F(t1Login.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, date: nextMonday, start_time: '19:00', end_time: '20:00' }),
  });
  check('teacher 无权建课（403）', t1Post.status === 403, `${t1Post.status}`);
  const t1Overview = await F(t1Login.cookie, `/api/schedule/overview?week_start=${nextMonday}`).then((r) => r.json());
  check('teacher 可看本校区忙闲总览（只读）', Array.isArray(t1Overview.teachers) && t1Overview.teachers.length === 2);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
