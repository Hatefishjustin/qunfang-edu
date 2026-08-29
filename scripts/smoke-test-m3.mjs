#!/usr/bin/env node
// M3 冒烟自测：基础数据全套 CRUD + 数据隔离
// 用法：node scripts/smoke-test-m3.mjs [baseUrl]（默认 http://127.0.0.1:8787）
// 前置：本地库已有迁移 0001 + seed 管理员
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

async function main() {
  const suffix = String(Date.now()).slice(-7);

  console.log('[准备] super_admin 登录');
  const sa = await login('13800000001', 'Passw0rd!');
  const saCookie = sa.cookie;
  check('super_admin 登录', sa.res.status === 200);

  // ---------- 两个校区 ----------
  console.log('[1] 建两个校区');
  const c1 = await F(saCookie, '/api/campuses', { method: 'POST', body: JSON.stringify({ name: `M3东校区${suffix}` }) });
  const campusA = (await c1.json()).id;
  const c2 = await F(saCookie, '/api/campuses', { method: 'POST', body: JSON.stringify({ name: `M3西校区${suffix}` }) });
  const campusB = (await c2.json()).id;
  check('建校区A/B', c1.status === 201 && c2.status === 201);

  // ---------- 每校区 8 位教师 ----------
  console.log('[2] 每校区 8 位教师');
  let ok = true;
  const teachersA = [];
  for (let i = 0; i < 8; i++) {
    const r = await F(saCookie, '/api/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: `教师A${i + 1}`, phone: `137${suffix}${String(i).padStart(2, '0')}`, campus_id: campusA, subject: i % 2 === 0 ? '美术' : '书法' }),
    });
    const b = await r.json().catch(() => null);
    if (r.status !== 201) ok = false;
    teachersA.push(b?.id);
  }
  const teachersB = [];
  for (let i = 0; i < 8; i++) {
    const r = await F(saCookie, '/api/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: `教师B${i + 1}`, phone: `136${suffix}${String(i).padStart(2, '0')}`, campus_id: campusB, subject: '钢琴' }),
    });
    teachersB.push((await r.json().catch(() => null))?.id);
    if (r.status !== 201) ok = false;
  }
  check('16 位教师全部创建成功', ok);

  const listA = await F(saCookie, `/api/teachers?campus_id=${campusA}`).then((r) => r.json());
  check('A 校教师列表 = 8 人', listA.length === 8, `实际 ${listA.length}`);

  // ---------- 可用时间规则 ----------
  console.log('[3] 教师可用时间');
  const t1 = teachersA[0];
  const putRules = await F(saCookie, `/api/teachers/${t1}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [
      { weekday: 0, start_time: '09:00', end_time: '12:00', kind: 'available' },
      { weekday: 0, start_time: '14:00', end_time: '18:00', kind: 'available' },
      { weekday: 6, start_time: '00:00', end_time: '23:59', kind: 'unavailable' },
    ] }),
  });
  check('保存 3 条规则', putRules.status === 200, `${putRules.status}`);

  const badRules = await F(saCookie, `/api/teachers/${t1}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [{ weekday: 0, start_time: '18:00', end_time: '09:00', kind: 'available' }] }),
  });
  check('非法时间段被拒绝（开始>结束）', badRules.status === 400, `${badRules.status}`);

  const getRules = await F(saCookie, `/api/teachers/${t1}/availability`).then((r) => r.json());
  check('规则读回一致', Array.isArray(getRules) && getRules.length === 3 &&
    getRules[2].kind === 'unavailable', JSON.stringify(getRules));

  // 教师只能改自己的（用 B 校教师 token 改 A 校教师 → 403）
  const teacherBLogin = await login(`136${suffix}00`, 'Passw0rd!');
  const crossPut = await F(teacherBLogin.cookie, `/api/teachers/${t1}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [] }),
  });
  check('教师不能改别人的可用时间（403）', crossPut.status === 403, `${crossPut.status}`);

  // ---------- 教室 / 课程 ----------
  console.log('[4] 教室与课程');
  const roomA = await F(saCookie, '/api/rooms', { method: 'POST', body: JSON.stringify({ name: `A美术教室${suffix}`, campus_id: campusA, capacity: 15 }) });
  check('建教室', roomA.status === 201);

  const courseGlobal = await F(saCookie, '/api/courses', { method: 'POST', body: JSON.stringify({ name: `通用美术${suffix}`, campus_id: null }) });
  const globalCourseId = (await courseGlobal.json()).id;
  const courseA = await F(saCookie, '/api/courses', { method: 'POST', body: JSON.stringify({ name: `A专属书法${suffix}`, campus_id: campusA }) });
  check('建课程（全局+A校区）', courseGlobal.status === 201 && courseA.status === 201);

  // campus_admin 视角：先建一个 A 校 campus_admin 账号
  const caCreate = await F(saCookie, '/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'A校管理员', phone: `138${suffix}66`, password: 'Passw0rd!', role: 'campus_admin', campus_id: campusA }),
  });
  check('创建 campus_admin 账号', caCreate.status === 201, `${caCreate.status}`);
  const caLogin = await login(`138${suffix}66`, 'Passw0rd!');
  const caCookie = caLogin.cookie;
  const caCourses = await F(caCookie, '/api/courses').then((r) => r.json());
  check('A 校排课老师可见 全局+本校区课程', caCourses.some((co) => co.id === globalCourseId) &&
    caCourses.some((co) => co.name?.includes('A专属')), JSON.stringify(caCourses?.map((co) => co.name)));

  // ---------- 班级 + 报班 ----------
  console.log('[5] 班级与报班');
  const cls = await F(saCookie, '/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name: `A书法入门班${suffix}`, course_id: globalCourseId, head_teacher_id: t1, capacity: 3, campus_id: campusA }),
  });
  const classId = (await cls.json()).id;
  check('建班级', cls.status === 201, `${cls.status}`);

  // 3 名学员
  const students = [];
  for (let i = 0; i < 3; i++) {
    const r = await F(saCookie, '/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: `学员A${i + 1}`, grade: '三年级', campus_id: campusA }),
    });
    students.push((await r.json()).id);
  }
  // 第 4 名学员（用于测试容量超限）
  const s4 = await F(saCookie, '/api/students', { method: 'POST', body: JSON.stringify({ name: `学员A4`, campus_id: campusA }) });
  const student4 = (await s4.json()).id;
  check('建 4 名学员', students.length === 3 && s4.status === 201);

  // 家长（关联 2 个孩子）
  const parent = await F(saCookie, '/api/parents', {
    method: 'POST',
    body: JSON.stringify({ name: `家长张三${suffix}`, relation: '父亲', phone: `135${suffix}01`, student_ids: [students[0], students[1]], campus_id: campusA }),
  });
  check('建家长并关联 2 个孩子', parent.status === 201, `${parent.status}`);

  const parentList = await F(saCookie, `/api/parents?campus_id=${campusA}`).then((r) => r.json());
  const created = parentList.find((p) => p.name?.includes('张三'));
  check('家长列表显示孩子姓名', created?.student_names?.split('、').length === 2, created?.student_names);

  // 报班 3 人（容量 3）
  let enrollOk = true;
  for (const sid of students) {
    const r = await F(saCookie, `/api/classes/${classId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ student_id: sid }),
    });
    if (r.status !== 201) enrollOk = false;
  }
  check('3 人报班成功', enrollOk);

  const full = await F(saCookie, `/api/classes/${classId}/enrollments`, {
    method: 'POST',
    body: JSON.stringify({ student_id: student4 }),
  });
  check('超出容量被拒绝', full.status === 400, `${full.status} ${JSON.stringify(await full.json().catch(() => null))}`);

  const dupEnroll = await F(saCookie, `/api/classes/${classId}/enrollments`, {
    method: 'POST',
    body: JSON.stringify({ student_id: students[0] }),
  });
  check('重复报班被拒绝', dupEnroll.status === 400, `${dupEnroll.status}`);

  const enrList = await F(saCookie, `/api/classes/${classId}/enrollments`).then((r) => r.json());
  check('班级学员 = 3', enrList.length === 3, `实际 ${enrList.length}`);

  // 退班
  const quit = await F(saCookie, `/api/classes/${classId}/enrollments/${students[2]}`, { method: 'DELETE' });
  check('退班成功', quit.status === 200, `${quit.status}`);

  // ---------- 数据隔离（campus_admin B 校视角） ----------
  console.log('[6] 跨校区隔离');
  const teacherListB = await F(teacherBLogin.cookie, '/api/teachers').then((r) => r.json());
  check('B 校教师只见 B 校（8人）', teacherListB.length === 8 &&
    teacherListB.every((t) => t.name.startsWith('教师B')), `实际 ${teacherListB.length}`);

  const crossClass = await F(teacherBLogin.cookie, `/api/classes/${classId}/enrollments`);
  check('teacher 无权管班级学员（403）', crossClass.status === 403, `${crossClass.status}`);

  // campus_admin 建教师带伪造 campus_id → 强制本校区
  const fakeCampus = await F(caCookie, '/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name: '伪造校区测试', phone: `135${suffix}88`, campus_id: campusB }),
  });
  const fakeBody = await fakeCampus.json().catch(() => null);
  check('伪造 campus_id 被忽略', fakeCampus.status === 201 && fakeBody?.campusId === campusA,
    `${fakeCampus.status} ${JSON.stringify(fakeBody)}`);

  // ---------- 学员软删 ----------
  console.log('[7] 学员软删');
  const delStudent = await F(saCookie, `/api/students/${student4}`, { method: 'DELETE' });
  check('软删学员', delStudent.status === 200);
  const studentList = await F(saCookie, `/api/students?campus_id=${campusA}`).then((r) => r.json());
  check('软删后列表不再显示', !studentList.some((s) => s.id === student4));

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
