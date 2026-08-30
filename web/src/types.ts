// 与后端共享的领域类型

export type Role = 'super_admin' | 'campus_admin' | 'teacher' | 'parent' | 'student';

export type UserSummary = {
  id: number;
  name: string;
  role: Role;
  campusId: number | null;
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '总管理员',
  campus_admin: '排课老师',
  teacher: '上课老师',
  parent: '家长',
  student: '学生',
};

// ---------- 校区 ----------
export type Campus = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  teacher_count: number;
  student_count: number;
  class_count: number;
};

// ---------- 看板 ----------
export type DashboardLesson = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  class_id: number;
  class_name: string | null;
  course_color: string | null;
  room_name: string | null;
  teacher_name: string | null;
};

export type Dashboard = {
  date: string;
  week_start: string;
  week_end: string;
  today_lessons: number;
  week_lessons: number;
  active_classes: number;
  checkin_rate: number | null;
  today_list: DashboardLesson[];
};

// ---------- 用户 ----------
export type UserItem = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: 'active' | 'disabled';
  campus_id: number | null;
  campus_name: string | null;
  created_at: string;
};

export type UserList = {
  items: UserItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ---------- 教师 ----------
export type Teacher = {
  id: number;
  name: string;
  phone: string;
  status: 'active' | 'disabled';
  campus_id: number | null;
  subject: string | null;
  bio: string | null;
  sort_no: number;
  rule_count: number;
  week_load: number;
};

export type AvailabilityRule = {
  id: number;
  weekday: number; // 0=周一 … 6=周日
  start_time: string;
  end_time: string;
  kind: 'available' | 'unavailable';
};

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ---------- 教室 ----------
export type Room = {
  id: number;
  campus_id: number;
  name: string;
  capacity: number | null;
};

// ---------- 课程 ----------
export type Course = {
  id: number;
  campus_id: number | null; // null = 全校区通用
  name: string;
  default_duration_min: number;
  color: string | null;
};

// ---------- 班级 ----------
export type ClassItem = {
  id: number;
  campus_id: number;
  course_id: number;
  name: string;
  head_teacher_id: number | null;
  capacity: number;
  status: 'active' | 'archived';
  course_name: string | null;
  course_color: string | null;
  head_teacher_name: string | null;
  enrolled_count: number;
};

export type EnrollmentItem = {
  student_id: number;
  name: string;
  grade: string | null;
  enrolled_at: string;
};

// ---------- 学员 ----------
export type StudentStatus = 'active' | 'prospect';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: '在读',
  prospect: '待开发',
};

export type Student = {
  id: number;
  campus_id: number;
  name: string;
  grade: string | null;
  birth_date: string | null;
  note: string | null;
  user_id: number | null;
  status: StudentStatus;
  parent_names: string | null;
  class_count: number;
  last_followup: string | null;
};

// ---------- 咨询师跟进记录 ----------
export type Followup = {
  id: number;
  contact_time: string;
  content: string;
  next_time: string | null;
  created_at: string;
  follower_name: string | null;
};

// ---------- 家长 ----------
export type Parent = {
  id: number;
  campus_id: number;
  name: string;
  relation: string | null;
  user_id: number | null;
  phone: string | null;
  student_names: string | null;
};

// ---------- 课（排课核心） ----------
export type Lesson = {
  id: number;
  campus_id: number;
  class_id: number;
  teacher_id: number;
  room_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'done' | 'cancelled';
  note: string | null;
  class_name: string | null;
  course_name: string | null;
  course_color: string | null;
  teacher_name: string | null;
  room_name: string | null;
};

// ---------- 教师忙闲总览 ----------
export type OverviewRule = {
  weekday: number;
  start_time: string;
  end_time: string;
  kind: 'available' | 'unavailable';
};

export type OverviewTeacher = {
  id: number;
  name: string;
  subject: string | null;
  rules: OverviewRule[];
  lessons: Lesson[];
};

export type OverviewData = {
  week_start: string;
  week_end: string;
  teachers: OverviewTeacher[];
};

// ---------- 课时卡 ----------
export type CardStatus = 'active' | 'exhausted' | 'refunded' | 'expired';

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  active: '使用中',
  exhausted: '已用完',
  refunded: '已退卡',
  expired: '已过期',
};

export type HourCard = {
  id: number;
  campus_id: number;
  student_id: number;
  course_id: number;
  title: string | null;
  total_lessons: number;
  used_lessons: number;
  status: CardStatus;
  valid_until: string | null;
  created_at: string;
  student_name: string | null;
  course_name: string | null;
};

export type LedgerEntry = {
  id: number;
  change: number;
  balance_after: number;
  reason: 'purchase' | 'attendance' | 'cancel_refund' | 'adjust';
  ref_lesson_id: number | null;
  created_at: string;
  operator_name?: string | null;
};

export const LEDGER_REASON_LABELS: Record<LedgerEntry['reason'], string> = {
  purchase: '购课',
  attendance: '上课扣课',
  cancel_refund: '取消回退',
  adjust: '手工调整',
};

/** 家长/学生端的卡（含余额与流水） */
export type MyCard = HourCard & {
  balance: number;
  expired: boolean;
  ledger: LedgerEntry[];
};

// ---------- 点名 ----------
export type AttendanceStatus = 'present' | 'absent' | 'leave';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: '到课',
  absent: '缺勤',
  leave: '请假',
};

export type AttendanceRecord = {
  student_id: number;
  status: AttendanceStatus;
  hour_card_id: number | null;
  deducted: number;
};

export type CheckinData = {
  lesson: {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'done' | 'cancelled';
    class_name: string | null;
    course_name: string | null;
    teacher_name: string | null;
  };
  students: {
    id: number;
    name: string;
    grade: string | null;
    balance: number;
    attendance: AttendanceRecord | null;
  }[];
};

/** 家长端课表条目（带 student_id 区分多个孩子） */
export type MyLesson = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  student_id?: number;
  class_name: string | null;
  course_name: string | null;
  course_color: string | null;
  teacher_name: string | null;
  room_name: string | null;
};

// ---------- 课堂内容（老师录入 / 家长学生查看留言） ----------
export type LessonFileItem = {
  id: number;
  mime: string;
  size: number;
  created_at: string;
};

export type LessonCommentItem = {
  id: number;
  user_id: number;
  role: Role;
  content: string;
  created_at: string;
  user_name: string | null;
};

export type LessonContentData = {
  lesson: {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    note: string | null;
    class_name: string | null;
    course_name: string | null;
    course_color: string | null;
    teacher_name: string | null;
    room_name: string | null;
  };
  files: LessonFileItem[];
  comments: LessonCommentItem[];
  can_edit: boolean;
};

// ---------- 调课 / 请假申请 ----------
export type ScheduleRequestType = 'reschedule' | 'leave';
export type ScheduleRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ScheduleRequest = {
  id: number;
  campus_id: number;
  lesson_id: number;
  student_id: number;
  requester_user_id: number;
  request_type: ScheduleRequestType;
  reason: string;
  requested_date: string | null;
  requested_start: string | null;
  requested_end: string | null;
  status: ScheduleRequestStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  lesson_date: string;
  lesson_start: string;
  lesson_end: string;
  lesson_status: string;
  student_name: string | null;
  class_name: string | null;
  course_name: string | null;
  requester_name: string | null;
  reviewer_name: string | null;
};

export const REQUEST_TYPE_LABELS: Record<ScheduleRequestType, string> = {
  reschedule: '调课',
  leave: '请假',
};

export const REQUEST_STATUS_LABELS: Record<ScheduleRequestStatus, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '未通过',
  cancelled: '已取消',
};

// ---------- 站内通知 ----------
export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  content: string;
  link: string | null;
  related_lesson_id: number | null;
  related_request_id: number | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationList = {
  items: NotificationItem[];
  unread_count: number;
};
