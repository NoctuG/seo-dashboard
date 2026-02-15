import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const LANGUAGE_STORAGE_KEY = 'seo.ui.language';
const fallbackLng = 'zh-CN';
const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
const browser = navigator.language || fallbackLng;
const initialLng = saved || browser;

const resources = {
  'en-US': {
    translation: {
      common: {
        loading: 'Loading...',
        create: 'Create',
        cancel: 'Cancel',
        delete: 'Delete',
        yes: 'Yes',
        no: 'No',
      },
      app: { loading: 'Loading...' },
      layout: {
        title: 'SEO Tool',
        projects: 'Projects',
        aiAssistant: 'AI Assistant',
        users: 'Users',
        systemSettings: 'System Settings',
        changePassword: 'Change Password',
        logout: 'Sign out',
        language: 'Language',
        langZhCN: '简体中文',
        langEnUS: 'English',
      },
      login: {
        title: 'Sign in to SEO Dashboard',
        email: 'Email',
        password: 'Password',
        submit: 'Sign in',
        loading: 'Signing in...',
        forgotPassword: 'Forgot password?',
        errors: { failed: 'Login failed. Please check email and password.' },
      },
      forgotPassword: {
        title: 'Forgot password',
        email: 'Email',
        submit: 'Send reset link',
        loading: 'Sending...',
        backToLogin: 'Back to sign in',
        errors: { failed: 'Failed to send reset email. Please try again later.' },
      },
      resetPassword: {
        title: 'Reset password',
        token: 'Reset token',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
        submit: 'Reset password',
        loading: 'Submitting...',
        backToLogin: 'Back to sign in',
        errors: {
          missingToken: 'Missing reset token.',
          passwordMismatch: 'New passwords do not match.',
          failed: 'Failed to reset password. Token may be expired.',
        },
      },
      changePassword: {
        title: 'Change password',
        oldPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
        submit: 'Update password',
        loading: 'Submitting...',
        errors: {
          passwordMismatch: 'New passwords do not match.',
          failed: 'Failed to change password. Please check current password.',
        },
      },
      projects: {
        title: 'Projects',
        newProject: 'New Project',
        createProject: 'Create Project',
        name: 'Name',
        domain: 'Domain',
        createdAt: 'Created {{date}}',
      },
      users: {
        title: 'User Management',
        createUser: 'Create User',
        email: 'Email',
        fullName: 'Full Name',
        name: 'Name',
        password: 'Password',
        active: 'Active',
        superuser: 'Superuser',
        actions: 'Actions',
        toggleActive: 'Toggle Active',
        toggleAdmin: 'Toggle Admin',
        empty: 'No users yet.',
        errors: {
          loadFailed: 'Failed to load users',
          createFailed: 'Failed to create user',
          updateFailed: 'Failed to update user',
          deleteFailed: 'Failed to delete user',
        },
      },
      systemSettings: {
        title: 'System Settings / Webhook Notifications',
        addWebhook: 'Add webhook',
        webhookUrl: 'Webhook URL',
        secret: 'Secret',
        subscribedEvents: 'Subscribed events',
        saveConfig: 'Save config',
        existingConfigs: 'Existing configs',
        events: 'Events',
        enable: 'Enable',
        disable: 'Disable',
        empty: 'No webhook configs yet.',
        confirmDelete: 'Are you sure to delete this webhook config?',
        errors: { loadFailed: 'Failed to load configuration' },
      },
      aiAssistant: {
        title: 'AI SEO Assistant',
        inputLabel: 'Input page content or SEO copy',
        placeholder: 'Paste main content, title, description, or product copy...',
        submit: 'Analyze with AI',
        loading: 'Analyzing...',
        result: 'Analysis result',
        errors: { requestFailed: 'AI request failed, please check configuration.' },
      },
      errorBoundary: {
        title: 'Something went wrong',
        description: 'Sorry, an unexpected issue occurred. You can retry or go back to home.',
        retry: 'Retry',
        goHome: 'Back to home',
      },
      roiNote: {
        title: 'Attribution notes',
        provider: 'Current source: {{provider}}, mapped to standard revenue field.',
        formula: 'ROI formula: ROI = (Gain - Cost) / Cost; gain includes realized revenue + assisted conversion value.',
        models: {
          linear: 'Linear: spreads assisted conversion value equally across all touchpoints.',
          first_click: 'First Click: highlights first SEO touchpoint contribution.',
          last_click: 'Last Click: highlights SEO contribution before final conversion.',
        },
      },
      keywords: { projectSettings: 'Market Settings', country: 'Country (gl)', language: 'Language (hl)', save: 'Save', locale: 'Locale', market: 'Market' },
      reports: { title: 'Reports', templateEditor: 'Template Editor', templateLocale: 'Template locale' },
      dashboard: { crawlStarted: 'Crawl started!' },
    },
  },
  'zh-CN': {
    translation: {
      common: { loading: '加载中...', create: '创建', cancel: '取消', delete: '删除', yes: '是', no: '否' },
      app: { loading: '加载中...' },
      layout: {
        title: 'SEO 工具', projects: '项目', aiAssistant: 'AI 助手', users: '用户管理', systemSettings: '系统设置', changePassword: '修改密码', logout: '退出登录', language: '语言', langZhCN: '简体中文', langEnUS: 'English',
      },
      login: {
        title: '登录 SEO Dashboard', email: '邮箱', password: '密码', submit: '登录', loading: '登录中...', forgotPassword: '忘记密码？', errors: { failed: '登录失败，请检查邮箱和密码。' },
      },
      forgotPassword: {
        title: '忘记密码', email: '邮箱', submit: '发送重置链接', loading: '发送中...', backToLogin: '返回登录', errors: { failed: '发送重置邮件失败，请稍后重试。' },
      },
      resetPassword: {
        title: '重置密码', token: '重置令牌', newPassword: '新密码', confirmPassword: '确认新密码', submit: '重置密码', loading: '提交中...', backToLogin: '返回登录',
        errors: { missingToken: '缺少重置令牌。', passwordMismatch: '两次输入的新密码不一致。', failed: '重置密码失败，令牌可能已失效。' },
      },
      changePassword: {
        title: '修改密码', oldPassword: '旧密码', newPassword: '新密码', confirmPassword: '确认新密码', submit: '更新密码', loading: '提交中...',
        errors: { passwordMismatch: '两次输入的新密码不一致。', failed: '修改密码失败，请检查旧密码。' },
      },
      projects: { title: '项目', newProject: '新建项目', createProject: '创建项目', name: '名称', domain: '域名', createdAt: '创建于 {{date}}' },
      users: {
        title: '用户管理', createUser: '新建用户', email: '邮箱', fullName: '姓名', name: '名称', password: '密码', active: '启用', superuser: '超级管理员', actions: '操作',
        toggleActive: '切换启用', toggleAdmin: '切换管理员', empty: '暂无用户。',
        errors: { loadFailed: '加载用户失败', createFailed: '创建用户失败', updateFailed: '更新用户失败', deleteFailed: '删除用户失败' },
      },
      systemSettings: {
        title: '系统设置 / Webhook 通知', addWebhook: '新增 Webhook', webhookUrl: 'Webhook URL', secret: '密钥', subscribedEvents: '订阅事件', saveConfig: '保存配置', existingConfigs: '现有配置', events: '事件', enable: '启用', disable: '禁用', empty: '暂无 webhook 配置。', confirmDelete: '确认删除该 webhook 配置？', errors: { loadFailed: '加载配置失败' },
      },
      aiAssistant: {
        title: 'AI SEO 助手', inputLabel: '输入页面内容或 SEO 文案', placeholder: '粘贴页面主要内容、标题、描述或产品文案...', submit: 'AI 分析', loading: '分析中...', result: '分析结果', errors: { requestFailed: 'AI 请求失败，请检查配置。' },
      },
      errorBoundary: { title: '页面发生错误', description: '抱歉，出现了意外问题。你可以重试，或返回首页继续使用。', retry: '重试', goHome: '返回首页' },
      roiNote: {
        title: '口径说明（避免管理层误读）', provider: '当前数据源：{{provider}}，已统一映射到标准 revenue 字段。', formula: 'ROI 公式：ROI = (收益 - 成本) / 成本；收益包含已实现收入 + 辅助转化折算价值。',
        models: { linear: 'Linear：将辅助转化价值按全触点均摊，适合季度复盘。', first_click: 'First Click：偏向获客阶段，强调 SEO 首次触达的贡献。', last_click: 'Last Click：偏向收口阶段，强调最终成交前的 SEO 贡献。' },
      },
      keywords: { projectSettings: '市场设置', country: '国家 (gl)', language: '语言 (hl)', save: '保存', locale: '语言地区', market: '市场' },
      reports: { title: '报告', templateEditor: '模板编辑', templateLocale: '模板语言区域' },
      dashboard: { crawlStarted: '爬取任务已启动！' },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: initialLng.startsWith('zh') ? 'zh-CN' : 'en-US',
  fallbackLng,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
});

export default i18n;
