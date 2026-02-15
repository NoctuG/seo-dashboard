import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Home, KeyRound, LogOut, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import {
    applyThemePreference,
    getStoredThemePreference,
    saveThemePreference,
    type ThemePreference,
} from './theme';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredThemePreference());

    useEffect(() => {
        applyThemePreference(themePreference);
        saveThemePreference(themePreference);
    }, [themePreference]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = () => {
            if (themePreference === 'system') {
                applyThemePreference('system');
            }
        };
        mediaQuery.addEventListener('change', handleSystemThemeChange);
        return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }, [themePreference]);

    const handleLogout = () => {
        signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
            <div className="w-64 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-700 flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 space-y-3">
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('layout.title')}</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">{user?.email}</p>
                    <label className="block text-xs text-slate-700 dark:text-slate-200">
                        {t('layout.language')}
                        <select
                            className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            value={i18n.language}
                            onChange={(e) => i18n.changeLanguage(e.target.value)}
                        >
                            <option value="zh-CN">简体中文</option>
                            <option value="en-US">English</option>
                        </select>
                    </label>
                    <label className="block text-xs text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1">
                            <MonitorCog size={14} /> Theme
                        </span>
                        <select
                            className="mt-1 w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            value={themePreference}
                            onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
                        >
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                            <option value="system">System</option>
                        </select>
                    </label>
                </div>
                <nav className="px-4 py-4 space-y-2 flex-1">
                    <Link to="/" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Home size={20} /> {t('layout.projects')}
                    </Link>
                    <Link to="/ai" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Sparkles size={20} /> {t('layout.aiAssistant')}
                    </Link>
                    {user?.is_superuser && (
                    <Link to="/users" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Users size={20} /> Users
                    </Link>
                    )}
                    {user?.is_superuser && (
                    <Link to="/settings" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Settings size={20} /> 系统设置
                    </Link>
                    )}
                    <Link to="/change-password" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <KeyRound size={20} /> 修改密码
                    </Link>
                    <Link to="/security/2fa" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <ShieldCheck size={20} /> 双重认证
                    </Link>
                    {user?.is_superuser && (
                    <Link to="/settings" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Settings size={20} /> 系统设置
                    </Link>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <LogOut size={16} /> {t('layout.logout')}
                    </button>
                </div>
            </div>
            <div className="flex-1 p-8 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}
