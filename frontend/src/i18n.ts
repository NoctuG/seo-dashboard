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
      app: { loading: 'Loading...' },
      layout: {
        title: 'SEO Tool',
        projects: 'Projects',
        aiAssistant: 'AI Assistant',
        logout: 'Sign out',
        language: 'Language',
      },
      keywords: {
        projectSettings: 'Market Settings',
        country: 'Country (gl)',
        language: 'Language (hl)',
        save: 'Save',
        locale: 'Locale',
        market: 'Market',
      },
      reports: {
        title: 'Reports',
        templateEditor: 'Template Editor',
        templateLocale: 'Template locale',
      },
      dashboard: {
        crawlStarted: 'Crawl started!',
      },
    },
  },
  'zh-CN': {
    translation: {
      app: { loading: '加载中...' },
      layout: {
        title: 'SEO 工具',
        projects: '项目',
        aiAssistant: 'AI 助手',
        logout: '退出登录',
        language: '语言',
      },
      keywords: {
        projectSettings: '市场设置',
        country: '国家 (gl)',
        language: '语言 (hl)',
        save: '保存',
        locale: '语言地区',
        market: '市场',
      },
      reports: {
        title: '报告',
        templateEditor: '模板编辑',
        templateLocale: '模板语言区域',
      },
      dashboard: {
        crawlStarted: '爬取任务已启动！',
      },
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
