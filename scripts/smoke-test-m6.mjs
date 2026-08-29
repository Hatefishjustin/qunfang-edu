#!/usr/bin/env node
// M6 验收冒烟：按交接文档第 13 章 DoD 逐条自动化验证
// 用法：node scripts/smoke-test-m6.mjs [baseUrl]（默认 http://127.0.0.1:8787）
// 前提：已应用迁移 + seed/seed.sql（测试账号 1380000000x 系列）
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
const J = (r) => r.json().catch(() => null);

const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const weekdayOf = (date) => (new Date(`${date}T00:00:00`).getDay() + 6) % 7;

async function main() {
  const suffix = String(Date.now()).slice(-7);
  const today = toISO(new Date());
  const nextMonday = addDays(today, ((0 - weekdayOf(today) + 7) % 7) || 7);

  // ========== DoD 1：五种角色登录 ==========
  console.log('[1] 五种角色登录（种子测试账号）');
  const sa = await login('13800000001', 'Passw0rd!');
  const caA = await login('13800000002', 'Passw0rd!'); // 阳光广场 campus_admin
  const caB = await login('13800000003', 'Passw0rd!'); // 滨江 campus_admin
  const tA = await login('13800000011', 'Passw0rd!'); // 阳光广场 teacher
  const tB = await login('13800000012', 'Passw0rd!'); // 滨江 teacher
  const pa = await login('13800000021', 'Passw0rd!'); // 家长（2 个孩子）
  const st = await login('13800000031', 'Passw0rd!'); // 学员
  check('super_admin 登录', sa.res.status === 200);
  check('campus_admin（阳光广场）登录', caA.res.status === 200, `${caA.res.status}`);
  check('campus_admin（滨江）登录', caB.res.status === 200, `${caB.res.status}`);
  check('teacher（阳光广场）登录', tA.res.status === 200, `${tA.res.status}`);
  check('teacher（滨江）登录', tB.res.status === 200, `${tB.res.status}`);
  check('parent 登录', pa.res.status === 200, `${pa.res.status}`);
  check('student 登录', st.res.status === 200, `${st.res.status}`);
  const paRole = await J(pa.res);
  const stRole = await J(st.res);
  check('parent 登录角色正确', paRole?.role === 'parent', JSON.stringify(paRole?.role));
  check('student 登录角色正确', stRole?.role === 'student', JSON.stringify(stRole?.role));

  // ========== DoD 2：越权测试 ==========
  console.log('[2] 越权与数据隔离');
  const tPost = await F(tA.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: 9121, teacher_id: 9031, date: nextMonday, start_time: '09:00', end_time: '10:30' }),
  });
  check('teacher token 调 POST /api/lessons → 403', tPost.status === 403, `${tPost.status}`);

  const caCross = await F(caA.cookie, `/api/lessons?campus_id=902`).then((r) => r.json());
  check(
    'campus_admin A 校带 campus_id=B 查询 → 只返回 A 校数据',
    Array.isArray(caCross) && caCross.length > 0 && caCross.every((l) => l.campus_id === 901),
    `n=${caCross?.length}`,
  );
  const caBCards = await F(caB.cookie, '/api/cards').then((r) => r.json());
  check('campus_admin B 只看到本校区课时卡', Array.isArray(caBCards) && caBCards.every((h) => h.campus_id === 902), `n=${caBCards?.length}`);

  const tMeCards = await F(tA.cookie, '/api/me/cards');
  check('teacher 访问 /api/me/cards → 403', tMeCards.status === 403, `${tMeCards.status}`);
  const paLessons = await F(pa.cookie, '/api/me/lessons').then((r) => r.json());
  const kidIds = new Set((Array.isArray(paLessons) ? paLessons : []).map((l) => l.student_id));
  check('parent 只能看到自己孩子（2 个）的课表', kidIds.size === 2, `实际 ${kidIds.size}`);
  const stLessons = await F(st.cookie, '/api/me/lessons').then((r) => r.json());
  const stKidIds = new Set((Array.isArray(stLessons) ? stLessons : []).map((l) => l.student_id));
  check('student 只能看到自己的课表', stKidIds.size === 1, `实际 ${stKidIds.size}`);

  // ========== DoD 3：种子数据（家长/学员视角） ==========
  console.log('[3] 种子数据核对');
  const stCards = await F(st.cookie, '/api/me/cards').then((r) => r.json());
  const stCard = Array.isArray(stCards) ? stCards[0] : null;
  check('学员有 1 张 20 节课时卡', stCards?.length === 1 && stCard?.total_lessons === 20, JSON.stringify(stCards?.length));
  check('学员卡流水 = 购课 + 已点名的扣课', stCard?.ledger?.length === 1 + stCard.used_lessons, `${stCard?.ledger?.length} vs ${1 + stCard?.used_lessons}`);
  let run = 0;
  let invOk = true;
  for (const e of [...stCard.ledger].reverse()) {
    run += e.change;
    if (e.balance_after !== run) invOk = false;
  }
  check('学员卡流水余额连续正确', invOk && run === stCard.total_lessons - stCard.used_lessons, `run=${run}`);

  // ========== DoD 4：忙闲总览渲染数据 ==========
  console.log('[4] 教师忙闲总览');
  const overview = await F(sa.cookie, `/api/schedule/overview?week_start=${nextMonday}&campus_id=901`).then((r) => r.json());
  const ovTs = overview?.teachers ?? [];
  check('阳光广场校区总览 8 位教师', ovTs.length === 8, `实际 ${ovTs.length}`);
  check('每位教师带可用时间规则', ovTs.every((t) => t.rules?.length === 7));
  const t31 = ovTs.find((t) => t.id === 9031);
  check('美术基础A班老师本周有课（课块带班级名）', (t31?.lessons?.length ?? 0) > 0 && t31.lessons.every((l) => l.class_name), `${t31?.lessons?.length}`);
  const caOverview = await F(caA.cookie, `/api/schedule/overview?week_start=${nextMonday}`).then((r) => r.json());
  check('campus_admin 看本校区总览', (caOverview?.teachers ?? []).length === 8);

  // ========== 自建数据：冲突 / 批量 / 点名闭环 / 软删 ==========
  console.log('[5] 准备自建测试数据');
  const campusId = (await J(await F(sa.cookie, '/api/campuses', { method: 'POST', body: JSON.stringify({ name: `M6校区${suffix}` }) }))).id;
  const t1 = (await J(await F(sa.cookie, '/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name: '冲突老师', phone: `134${suffix}01`, campus_id: campusId, subject: '美术' }),
  })));
  const t2 = (await J(await F(sa.cookie, '/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name: '闲老师', phone: `134${suffix}02`, campus_id: campusId, subject: '书法' }),
  })));
  const room = (await J(await F(sa.cookie, '/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name: `M6教室${suffix}`, campus_id: campusId, capacity: 10 }),
  })));
  const course = (await J(await F(sa.cookie, '/api/courses', {
    method: 'POST',
    body: JSON.stringify({ name: `M6科目${suffix}`, campus_id: campusId }),
  })));
  const cls = (await J(await F(sa.cookie, '/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name: `M6班${suffix}`, course_id: course.id, head_teacher_id: t1.id, campus_id: campusId }),
  })));
  const cls2 = (await J(await F(sa.cookie, '/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name: `M6班2${suffix}`, course_id: course.id, head_teacher_id: t2.id, campus_id: campusId }),
  })));
  const s1 = (await J(await F(sa.cookie, '/api/students', {
    method: 'POST',
    body: JSON.stringify({ name: `M6学员${suffix}`, campus_id: campusId }),
  })));
  await F(sa.cookie, `/api/classes/${cls.id}/enrollments`, { method: 'POST', body: JSON.stringify({ student_id: s1.id }) });
  check('自建数据就绪', !!campusId && !!t1.id && !!room.id && !!course.id && !!cls.id && !!s1.id);

  // DoD 5：三类冲突 + force
  console.log('[6] 排课冲突三类拦截');
  await F(sa.cookie, `/api/teachers/${t1.id}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [{ weekday: weekdayOf(nextMonday), start_time: '09:00', end_time: '12:00', kind: 'unavailable' }] }),
  });
  const c1 = await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, date: nextMonday, start_time: '10:00', end_time: '11:30' }),
  });
  check('unavailable 冲突被拦截（409）', c1.status === 409, `${c1.status}`);
  const c1f = await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, date: nextMonday, start_time: '10:00', end_time: '11:30', force: true }),
  });
  check('force=true 可跳过 unavailable', c1f.status === 201, `${c1f.status}`);

  const c2 = await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, room_id: room.id, date: nextMonday, start_time: '14:00', end_time: '15:30' }),
  });
  check('正常建课', c2.status === 201, `${c2.status}`);
  const c3 = await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t1.id, date: nextMonday, start_time: '15:00', end_time: '16:30' }),
  });
  check('老师重叠被拦截（409）', c3.status === 409, `${c3.status}`);
  const c4 = await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t2.id, room_id: room.id, date: nextMonday, start_time: '14:30', end_time: '16:00' }),
  });
  check('教室重叠被拦截（409）', c4.status === 409, `${c4.status}`);

  // DoD 6：批量 16 周
  console.log('[7] 按周批量建课 16 周');
  const batch = await F(sa.cookie, '/api/lessons/batch', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls2.id, teacher_id: t2.id, weekday: 2, start_time: '16:00', end_time: '17:30', start_date: nextMonday, weeks: 16 }),
  });
  const batchB = await J(batch);
  check('批量建 16 节成功', batch.status === 201 && batchB.created === 16, `${batch.status}`);
  const t2All = await F(sa.cookie, `/api/lessons?from=${nextMonday}&to=${addDays(nextMonday, 120)}&teacher_id=${t2.id}`).then((r) => r.json());
  check('日历查询批量课齐全（16 节）', t2All.length === 16, `实际 ${t2All.length}`);
  const ov2 = await F(sa.cookie, `/api/schedule/overview?week_start=${addDays(nextMonday, 7)}&campus_id=${campusId}`).then((r) => r.json());
  const ov2t2 = (ov2?.teachers ?? []).find((t) => t.id === t2.id);
  check('总览次周显示批量课', (ov2t2?.lessons?.length ?? 0) === 1, `实际 ${ov2t2?.lessons?.length}`);

  // DoD 7/8：点名闭环 + 取消回退
  console.log('[8] 点名扣课闭环');
  const card = await J(await F(sa.cookie, '/api/cards', {
    method: 'POST',
    body: JSON.stringify({ student_id: s1.id, course_id: course.id, total_lessons: 20 }),
  }));
  check('售课 20 节', !!card.id, JSON.stringify(card));

  const l1 = await J(await F(sa.cookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, date: today, start_time: '09:00', end_time: '10:30' }),
  }));
  const att = await F(sa.cookie, `/api/lessons/${l1.id}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: s1.id, status: 'present' }] }),
  });
  check('点名提交成功', att.status === 200, `${att.status}`);

  const afterAtt = (await F(sa.cookie, `/api/cards?student_id=${s1.id}`).then((r) => r.json())).find((h) => h.id === card.id);
  check('点名后余额 19（-1）', afterAtt.total_lessons - afterAtt.used_lessons === 19, JSON.stringify(afterAtt));

  const ledger = await F(sa.cookie, `/api/cards/${card.id}/ledger`).then((r) => r.json());
  const asc = [...ledger].reverse();
  let run2 = 0;
  let inv2 = true;
  for (const e of asc) {
    run2 += e.change;
    if (e.balance_after !== run2) inv2 = false;
  }
  check('流水 balance_after 连续正确（购课20→点名19）', inv2 && run2 === 19 && asc.length === 2, `${run2}/${asc.length}`);

  const cancel = await F(sa.cookie, `/api/lessons/${l1.id}`, { method: 'DELETE' });
  const cancelB = await J(cancel);
  check('取消已点名课成功且回退 1 人次', cancel.status === 200 && cancelB.refunded === 1, `${cancel.status} ${JSON.stringify(cancelB)}`);

  const afterCancel = (await F(sa.cookie, `/api/cards?student_id=${s1.id}`).then((r) => r.json())).find((h) => h.id === card.id);
  check('取消后余额回退为 20', afterCancel.total_lessons - afterCancel.used_lessons === 20, JSON.stringify(afterCancel));
  const ledger2 = await F(sa.cookie, `/api/cards/${card.id}/ledger`).then((r) => r.json());
  check('流水含 cancel_refund（+1）', ledger2.some((e) => e.reason === 'cancel_refund' && e.change === 1), JSON.stringify(ledger2.map((e) => e.reason)));

  // DoD 9：软删学员后历史可追溯
  console.log('[9] 软删学员可追溯');
  const del = await F(sa.cookie, `/api/students/${s1.id}`, { method: 'DELETE' });
  check('软删学员成功', del.status === 200, `${del.status}`);
  const cardsAfterDel = await F(sa.cookie, `/api/cards?student_id=${s1.id}`).then((r) => r.json());
  check('软删后课时卡仍在（可查）', Array.isArray(cardsAfterDel) && cardsAfterDel.length === 1, `n=${cardsAfterDel?.length}`);
  const ledgerAfterDel = await F(sa.cookie, `/api/cards/${card.id}/ledger`).then((r) => r.json());
  check('软删后流水仍可追溯（3 条）', Array.isArray(ledgerAfterDel) && ledgerAfterDel.length === 3, `n=${ledgerAfterDel?.length}`);
  check('历史扣课流水 ref_lesson_id 仍指向原课次', ledger2.some((e) => e.ref_lesson_id === l1.id));

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
