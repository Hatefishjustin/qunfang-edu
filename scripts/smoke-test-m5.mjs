#!/usr/bin/env node
// M5 冒烟自测：课时与考勤 —— 售课20 → 3节课点名 → 余额17 → 取消1节 → 余额18 → 流水核对（6.5 不变式）
// 用法：node scripts/smoke-test-m5.mjs [baseUrl]（默认 http://127.0.0.1:8787）
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

async function main() {
  const suffix = String(Date.now()).slice(-7);
  const today = toISO(new Date());
  const tomorrow = addDays(today, 1);

  console.log('[准备] super_admin 登录');
  const sa = await login('13800000001', 'Passw0rd!');
  const saCookie = sa.cookie;
  check('super_admin 登录', sa.res.status === 200);

  // ---------- 基础数据 ----------
  console.log('[1] 准备校区/教师/教室/课程/班级/学员/家长');
  const campusId = (await J(await F(saCookie, '/api/campuses', { method: 'POST', body: JSON.stringify({ name: `M5校区${suffix}` }) }))).id;
  const t1 = (await J(await F(saCookie, '/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name: '点名老师', phone: `136${suffix}01`, campus_id: campusId, subject: '美术' }),
  })));
  const room = (await J(await F(saCookie, '/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name: `M5教室${suffix}`, campus_id: campusId, capacity: 10 }),
  })));
  const course = (await J(await F(saCookie, '/api/courses', {
    method: 'POST',
    body: JSON.stringify({ name: `M5科目${suffix}`, campus_id: campusId }),
  })));
  const cls = (await J(await F(saCookie, '/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name: `M5班${suffix}`, course_id: course.id, head_teacher_id: t1.id, campus_id: campusId }),
  })));
  check('建教师/教室/课程/班级', !!t1.id && !!room.id && !!course.id && !!cls.id);

  const sA = (await J(await F(saCookie, '/api/students', {
    method: 'POST',
    body: JSON.stringify({ name: `学员甲${suffix}`, campus_id: campusId, grade: '三年级' }),
  })));
  const sB = (await J(await F(saCookie, '/api/students', {
    method: 'POST',
    body: JSON.stringify({ name: `学员乙${suffix}`, campus_id: campusId, grade: '四年级' }),
  })));
  check('建 2 名学员', !!sA.id && !!sB.id);

  for (const s of [sA, sB]) {
    const e = await F(saCookie, `/api/classes/${cls.id}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ student_id: s.id }),
    });
    check(`学员 ${s.id} 报班`, e.status === 201, `${e.status}`);
  }

  const parent = (await J(await F(saCookie, '/api/parents', {
    method: 'POST',
    body: JSON.stringify({ name: `家长${suffix}`, phone: `135${suffix}09`, password: 'Passw0rd!', campus_id: campusId, student_ids: [sA.id, sB.id] }),
  })));
  check('建家长（开通登录，关联 2 个孩子）', !!parent.id && !!parent.userId, JSON.stringify(parent));

  // ---------- 售课 ----------
  console.log('[2] 售课 20 节');
  const sell = await F(saCookie, '/api/cards', {
    method: 'POST',
    body: JSON.stringify({ student_id: sA.id, course_id: course.id, total_lessons: 20, title: '20 节包' }),
  });
  const card = await J(sell);
  check('售课成功（返回卡 id）', sell.status === 201 && card.id > 0, `${sell.status} ${JSON.stringify(card)}`);
  const cardId = card.id;

  const cardList = (await J(await F(saCookie, `/api/cards?student_id=${sA.id}`)));
  const myCard = cardList.find((h) => h.id === cardId);
  check('卡列表：总 20 已用 0', myCard?.total_lessons === 20 && myCard?.used_lessons === 0, JSON.stringify(myCard));

  // ---------- 3 节课 + 点名 ----------
  console.log('[3] 排今天的 3 节课并逐节点名');
  const times = [
    ['09:00', '10:30'],
    ['11:00', '12:30'],
    ['14:00', '15:30'],
  ];
  const lessons = [];
  for (const [st, et] of times) {
    const r = await F(saCookie, '/api/lessons', {
      method: 'POST',
      body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, room_id: room.id, date: today, start_time: st, end_time: et }),
    });
    const b = await J(r);
    check(`建课 ${st}–${et}`, r.status === 201, `${r.status} ${JSON.stringify(b)}`);
    lessons.push(b.id);
  }

  // 点名页数据
  const pageData = await J(await F(saCookie, `/api/lessons/${lessons[0]}/attendance`));
  check('点名页带出 2 名学员', pageData?.students?.length === 2, JSON.stringify(pageData?.students?.length));
  const pageA = pageData?.students?.find((s) => s.id === sA.id);
  check('点名页显示学员甲科目余额 20', pageA?.balance === 20, JSON.stringify(pageA?.balance));

  // 第 1 节：甲到课、乙缺勤
  const att1 = await F(saCookie, `/api/lessons/${lessons[0]}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: sA.id, status: 'present' }, { student_id: sB.id, status: 'absent' }] }),
  });
  const att1b = await J(att1);
  check('点名 1：到课 1 缺勤 1', att1.status === 200 && att1b.present === 1 && att1b.absent === 1, `${att1.status} ${JSON.stringify(att1b)}`);

  // 第 2 节：甲到课、乙请假
  const att2 = await F(saCookie, `/api/lessons/${lessons[1]}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: sA.id, status: 'present' }, { student_id: sB.id, status: 'leave' }] }),
  });
  const att2b = await J(att2);
  check('点名 2：到课 1 请假 1（请假不扣课）', att2.status === 200 && att2b.present === 1 && att2b.leave === 1, `${att2.status} ${JSON.stringify(att2b)}`);

  // 第 3 节：甲到课、乙到课（乙没卡 → 提示未扣）
  const att3 = await F(saCookie, `/api/lessons/${lessons[2]}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: sA.id, status: 'present' }, { student_id: sB.id, status: 'present' }] }),
  });
  const att3b = await J(att3);
  check('点名 3：到课 2（乙无卡记为未扣）', att3.status === 200 && att3b.present === 2 && JSON.stringify(att3b.no_card) === `[${sB.id}]`, `${att3.status} ${JSON.stringify(att3b)}`);

  // ---------- 余额 17 ----------
  console.log('[4] 核对余额 17');
  const card17 = (await J(await F(saCookie, `/api/cards?student_id=${sA.id}`))).find((h) => h.id === cardId);
  check('余额 17（20 - 3）', card17?.total_lessons - card17?.used_lessons === 17 && card17?.used_lessons === 3, JSON.stringify(card17));

  // ---------- 取消 1 节已点名课 → 余额 18 ----------
  console.log('[5] 取消第 1 节（已点名）→ 回退 1 节');
  const cancel = await F(saCookie, `/api/lessons/${lessons[0]}`, { method: 'DELETE' });
  const cancelB = await J(cancel);
  check('取消已点名课，回退 1 人次', cancel.status === 200 && cancelB.refunded === 1, `${cancel.status} ${JSON.stringify(cancelB)}`);

  const card18 = (await J(await F(saCookie, `/api/cards?student_id=${sA.id}`))).find((h) => h.id === cardId);
  check('余额 18（17 + 1）', card18?.total_lessons - card18?.used_lessons === 18 && card18?.used_lessons === 2, JSON.stringify(card18));

  // ---------- 流水核对（6.5 不变式） ----------
  console.log('[6] 流水核对（不变式 balance_after == total - used 累计）');
  const ledger = await J(await F(saCookie, `/api/cards/${cardId}/ledger`));
  // ledger 按 id DESC 返回：cancel_refund, attendance×3, purchase
  const asc = [...ledger].reverse();
  check('流水共 5 条（购卡 1 + 扣课 3 + 回退 1；扣退变动 4 条）', asc.length === 5, `实际 ${asc.length}`);

  let balance = 0;
  let invariantOk = true;
  const reasons = [];
  for (const e of asc) {
    balance += e.change;
    reasons.push(`${e.reason}${e.change > 0 ? '+' : ''}${e.change}`);
    if (e.balance_after !== balance) invariantOk = false;
  }
  check('不变式：每条流水 balance_after == 累计变动', invariantOk, JSON.stringify(asc.map((e) => e.balance_after)));
  check('流水累计 = 最终余额 18', balance === 18, `${balance}`);
  check(
    '流水原因序列 = purchase/attendance×3/cancel_refund',
    asc[0].reason === 'purchase' && asc.slice(1, 4).every((e) => e.reason === 'attendance') && asc[4].reason === 'cancel_refund',
    reasons.join(' → '),
  );

  // ---------- 边界 ----------
  console.log('[7] 边界与权限');
  const again = await F(saCookie, `/api/lessons/${lessons[1]}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: sA.id, status: 'present' }] }),
  });
  check('已点名（done）的课不能重复点名', again.status === 400, `${again.status}`);

  const future = await F(saCookie, '/api/lessons', {
    method: 'POST',
    body: JSON.stringify({ class_id: cls.id, teacher_id: t1.id, date: tomorrow, start_time: '16:00', end_time: '17:00' }),
  });
  const futureId = (await J(future)).id;
  const futureAtt = await F(saCookie, `/api/lessons/${futureId}/attendance`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ student_id: sA.id, status: 'present' }] }),
  });
  check('未来课不能点名', futureAtt.status === 400, `${futureAtt.status}`);

  const adjustNoNote = await F(saCookie, `/api/cards/${cardId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ change: 2 }),
  });
  check('手工调整必须填备注', adjustNoNote.status === 400, `${adjustNoNote.status}`);

  const adjustBad = await F(saCookie, `/api/cards/${cardId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ change: -100, note: '纠错' }),
  });
  check('调整后总量不能小于已用', adjustBad.status === 400, `${adjustBad.status}`);

  const adjustOk = await F(saCookie, `/api/cards/${cardId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ change: 2, note: '赠送 2 节' }),
  });
  const adjustB = await J(adjustOk);
  check('手工调整 +2 → 总 22 余额 20', adjustOk.status === 200 && adjustB.total_lessons === 22 && adjustB.balance === 20, JSON.stringify(adjustB));

  // 教师权限
  const tLogin = await login(`136${suffix}01`, 'Passw0rd!');
  const tSell = await F(tLogin.cookie, '/api/cards', {
    method: 'POST',
    body: JSON.stringify({ student_id: sA.id, course_id: course.id, total_lessons: 10 }),
  });
  check('教师无权售课（403）', tSell.status === 403, `${tSell.status}`);
  const tMeCards = await F(tLogin.cookie, '/api/me/cards');
  check('教师无权访问家长/学生接口', tMeCards.status === 403, `${tMeCards.status}`);
  const tAtt = await F(tLogin.cookie, `/api/lessons/${lessons[1]}/attendance`);
  check('教师可查自己课的点名页数据', tAtt.status === 200, `${tAtt.status}`);

  // 家长端
  console.log('[8] 家长端（/api/me）');
  const pLogin = await login(`135${suffix}09`, 'Passw0rd!');
  check('家长登录', pLogin.res.status === 200);

  const pCards = await J(await F(pLogin.cookie, '/api/me/cards'));
  const pCard = (Array.isArray(pCards) ? pCards : []).find((h) => h.id === cardId);
  check('家长看到孩子的卡（余额 20）', pCard?.balance === 20 && pCard?.ledger?.length === 6, JSON.stringify(pCard?.balance));
  check('家长能看到流水明细', pCard?.ledger?.some((e) => e.reason === 'purchase') && pCard?.ledger?.some((e) => e.reason === 'cancel_refund'));

  const pLessons = await J(await F(pLogin.cookie, '/api/me/lessons'));
  const kidIds = new Set((Array.isArray(pLessons) ? pLessons : []).map((l) => l.student_id));
  check('家长看到 2 个孩子的课表（带 student_id 区分）', kidIds.size === 2, JSON.stringify([...kidIds]));
  const cancelledShown = (Array.isArray(pLessons) ? pLessons : []).some((l) => l.id === lessons[0]);
  check('已取消的课不在家长课表里', !cancelledShown);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
