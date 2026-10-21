const messages: Record<string, string> = {
  'Project name': '项目名称',
  'Client / Organization': '客户 / 组织',
  Deadline: '截止日期',
  'Out of scope and exceptions': '范围外事项与例外',
  'Code {{code}} · Kickoff {{date}}': '编号 {{code}} · 启动日期 {{date}}',
  'Project name is too short': '项目名称过短',
  'Deadline cannot be earlier than the kickoff date': '截止日期不能早于启动日期',
  'Project settings saved': '项目设置已保存',

  Members: '成员',
  '{{count}} member': '{{count}} 名成员',
  '{{count}} members': '{{count}} 名成员',
  Joined: '加入时间',
  'Search members': '搜索成员',
  'Search by name or email': '按姓名或邮箱搜索',
  'Assign role': '分配角色',
  'Add as {{role}}': '添加为{{role}}',
  'Searching accounts…': '正在搜索账号…',
  'No matching active accounts. An administrator creates new accounts.':
    '没有匹配的启用账号。新账号由管理员创建。',
  'Only project leads and administrators can manage members.':
    '仅项目负责人和管理员可以管理成员。',
  'Unassigned: {{roles}}. Missing roles block the related reviews, acceptance, or sign-off.':
    '未分配：{{roles}}。缺少角色将阻塞相关核对、验收或签认。',
  'Added {{name}} as {{role}}': '已将 {{name}} 添加为{{role}}',
  'Member removed': '成员已移除',
  'Remove member': '移除成员',
  'The member loses access to this project. Removal is blocked if they still own open risks, conditions, or active sign-offs.':
    '该成员将失去此项目的访问权限。若其仍负责未关闭的风险、条件或有效签认，则无法移除。',

  'Project stage': '项目阶段',
  'Pause project': '暂停项目',
  'Resume project': '恢复项目',
  'All write actions are locked while paused. Members can still view records.':
    '暂停期间所有写操作均已锁定，成员仍可查看记录。',
  'Members can continue submitting, reviewing, and accepting work.':
    '成员可以继续提交、核对和验收工作。',
  Pause: '暂停',
  Resume: '恢复',
  'Project paused': '项目已暂停',
  'Project resumed': '项目已恢复',
  'Advance to {{stage}}': '推进至{{stage}}',
  Advance: '推进',
  'Advance stage': '推进阶段',
  'Advance project stage': '推进项目阶段',
  'Advancing records the completion time. Confirm the current stage is finished.':
    '推进将记录完成时间。请确认当前阶段已完成。',
  'The project moves from {{from}} to {{to}}.': '项目将从{{from}}进入{{to}}。',
  'Project stage advanced': '项目阶段已推进',
  'Reopen project': '重新开启项目',
  Reopen: '重新开启',
  'Voids the current conclusion and sign-offs and returns the project to Verification. History is kept.':
    '作废当前结论与签认，并将项目退回接收验证阶段。历史记录保留。',
  'The current conclusion and sign-offs will be voided, and the project returns to Verification. This cannot be undone.':
    '当前结论与签认将作废，项目将退回接收验证阶段。此操作无法撤销。',
  'Project reopened': '项目已重新开启',
  'No manual stage actions are available.': '当前没有可用的手动阶段操作。',
  'Project stages are managed by the project lead.': '项目阶段由项目负责人管理。',
};

export default messages;
