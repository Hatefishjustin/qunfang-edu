# R8 技术设计

## 数据模型

- `schedule_requests`：保存课程、学员、申请人、申请类型、期望时间、原因、状态及审批信息。
- `notifications`：按 `user_id` 保存类型、标题、正文、跳转地址、关联课程/申请和已读时间。
- D1 与 CloudBase PG 分别新增等价的 `0003` 迁移，不修改既有迁移。

## 接口

- `GET/POST /api/schedule-requests`：按角色返回本人的申请或本校区待办；仅家长/学生可提交。
- `PATCH /api/schedule-requests/:id/review`：管理员批准或驳回。
- `PATCH /api/schedule-requests/:id/cancel`：申请人取消自己的待审批申请。
- `GET /api/notifications`：生成当前用户的近期课程提醒并返回通知与未读数。
- `PATCH /api/notifications/:id/read`、`POST /api/notifications/read-all`：更新本人已读状态。

## 通知路由

| 事件 | 接收人 |
| --- | --- |
| 课程临近 | 该课老师、在册学生账号、关联家长账号 |
| 新建/调整/取消课程 | 该课老师、在册学生账号、关联家长账号 |
| 提交调课/请假申请 | 该校区排课老师、总管理员 |
| 批准/驳回/取消申请 | 申请人；调课批准同时通知课程相关人 |
| 老师更新课堂反馈 | 该班在册学生账号、关联家长账号 |

## 安全与一致性

- 家长/学生身份通过既有 `parents -> parent_student` 或 `students.user_id` 反查，不接受客户端越权指定。
- 审批调课复用 `checkLessonConflicts`，冲突时不写审批结果。
- 请假批准将考勤预置与申请状态放在同一 `DB.batch()` 中。
- 通知查询始终强制 `user_id = 当前用户`。

## 界面

- `NotificationButton` 固定在所有角色页头右侧，面板为米白玻璃抽屉。
- 家庭课表的课程内容弹窗提供“申请调课 / 请假”入口，并新增申请记录页。
- 排课中心新增“申请审批”页，卡片以状态和时间为主层级，不使用业务彩色填充。
- 通用 `Modal` 提升到导航之上，标题固定、正文独立滚动。

