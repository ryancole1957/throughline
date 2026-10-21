const messages: Record<string, string> = {
  ADMINISTRATION: '管理',
  'Manage user accounts and access.': '管理用户账号与访问权限。',
  '{{count}} account': '{{count}} 个账号',
  '{{count}} accounts': '{{count}} 个账号',
  '{{count}} admin': '{{count}} 名管理员',
  '{{count}} admins': '{{count}} 名管理员',
  '{{count}} disabled': '{{count}} 个已停用',
  'Initial passwords are set at creation. Share them through a secure channel and ask the user to change the password under Account security after first sign-in. At least one active admin is required; disabling an account ends all its sessions immediately.':
    '初始密码在创建时设置。请通过安全渠道告知用户，并要求其在首次登录后前往账户安全修改密码。系统至少需保留一名启用状态的管理员；停用账号会立即终止其全部会话。',
  'Loading accounts…': '正在加载账号…',
  'No accounts yet': '暂无账号',
  'Create the first account, then add members to projects.':
    '创建第一个账号，然后将成员添加到项目中。',
  User: '用户',
  'System role': '系统角色',
  Status: '状态',
  'Last sign-in': '最近登录',
  Created: '创建时间',
  Never: '从未登录',
  'Edit account': '编辑账号',
  'Update account details, system role, or status. Changes apply immediately.':
    '更新账号信息、系统角色或状态。修改立即生效。',
  'Project leads add new users to projects and assign roles separately.':
    '新用户由项目负责人添加到项目并单独分配角色。',
  'Create account': '创建账号',
  Name: '姓名',
  Title: '职务',
  'e.g. Platform engineer': '例如：平台工程师',
  Email: '邮箱',
  'name@organization.com': 'name@organization.com',
  'Account status': '账号状态',
  Active: '启用',
  Disabled: '已停用',
  'Reset password': '重置密码',
  'Initial password': '初始密码',
  "Leave blank to keep the current password. Setting one signs out all of this account's sessions.":
    '留空则保持当前密码。设置新密码将终止该账号的全部会话。',
  'At least 12 characters. Share it through a secure channel.':
    '至少 12 个字符。请通过安全渠道告知。',
  'Leave blank to keep the current password': '留空则保持当前密码',
  'At least 12 characters': '至少 12 个字符',
  'Name is required': '姓名为必填项',
  'New password must be at least 12 characters': '新密码至少需要 12 个字符',
  'Enter a valid email address': '请输入有效的邮箱地址',
  'Initial password must be at least 12 characters': '初始密码至少需要 12 个字符',
  'Account updated': '账号已更新',
  'Account created': '账号已创建',
  'Member · project roles assigned by project leads':
    '成员 · 项目角色由项目负责人分配',
  'Admin · manages all projects and accounts': '管理员 · 管理所有项目和账号',

  ACCOUNT: '账户',
  'Manage your password and sessions.': '管理密码与登录会话。',
  'No title': '未填写职务',
  'Change password': '修改密码',
  'Current password': '当前密码',
  'New password': '新密码',
  'Confirm new password': '确认新密码',
  'At least 12 characters. Other sessions will be signed out.':
    '至少 12 个字符。其他会话将被登出。',
  'Update password': '更新密码',
  'Enter your current password': '请输入当前密码',
  'New passwords do not match': '两次输入的新密码不一致',
  'Password updated. Other sessions have been signed out.':
    '密码已更新，其他会话已登出。',
  'End current session': '结束当前会话',
  'You will need to sign in again.': '你需要重新登录。',

  'Page not found': '页面不存在',
  'This page may have been moved, or you may not have access.':
    '此页面可能已移动，或你无权访问。',

  'Evidence supply progress': '证据供给进度',
  'Supplied {{supply}}/{{total}}': '已提供 {{supply}}/{{total}}',
  'Acceptance progress': '验收进度',
  'Accepted {{accepted}}/{{total}}': '已验收 {{accepted}}/{{total}}',

  'Something went wrong. Please try again.': '出现异常，请重试。',
  'Network request failed. Check your connection and try again.':
    '网络请求失败，请检查网络连接后重试。',
  'Request failed ({{status}})': '请求失败（{{status}}）',
  "Couldn't load your session": '无法加载登录会话',
  'Your session has expired': '登录会话已过期',
  'Your session has expired. Sign in again.': '登录会话已过期，请重新登录。',
  'Export failed. Please try again.': '导出失败，请重试。',
};

export default messages;
