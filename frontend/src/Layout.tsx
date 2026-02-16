import { useEffect, useMemo, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Home, KeyRound, LogOut, MonitorCog, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import {
    applyThemePreference,
    getStoredThemePreference,
    saveThemePreference,
    type ThemePreference,
} from './theme';

type VersionPayload = {
    version: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [serverVersion, setServerVersion] = useState<string | null>(null);
    const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);

    useEffect(() => {
        applyThemePreference(themePreference);
        saveThemePreference(themePreference);
    }, [themePreference]);

    const displayVersion = useMemo(() => {
        if (serverVersion) {
            return serverVersion;
        }
        return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
    }, [serverVersion]);

    useEffect(() => {
        let active = true;

        const loadVersion = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/version`);
                if (!response.ok) {
                    return;
                }
                const payload = (await response.json()) as VersionPayload;
                if (active && payload.version) {
                    setServerVersion(payload.version);
                }
            } catch {
                // Fallback to frontend injected version.
            }
        };

        void loadVersion();
        return () => {
            active = false;
        };
    }, []);

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
                            <option value="zh-CN">{t('layout.langZhCN')}</option>
                            <option value="en-US">{t('layout.langEnUS')}</option>
                        </select>
                    </label>
                    <label className="block text-xs text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1">
                            <MonitorCog size={14} /> {t('layout.theme')}
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
                    <Link to="/ai/content" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <span className="w-5 h-5 flex items-center justify-center"><i className="fa-solid fa-wand-magic-sparkles text-sm" style={{ color: '#63C4F8' }} /></span> {t('layout.aiContent')}
                    </Link>
                    {user?.is_superuser && (
                    <Link to="/users" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Users size={20} /> {t('layout.users')}
                    </Link>
                    )}
                    {user?.is_superuser && (
                    <Link to="/settings" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <Settings size={20} /> {t('layout.systemSettings')}
                    </Link>
                    )}
                    <Link to="/change-password" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <KeyRound size={20} /> {t('layout.changePassword')}
                    </Link>
                    <Link to="/security/2fa" className="flex items-center gap-2 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                        <ShieldCheck size={20} /> {t('layout.twoFactorAuth')}
                    </Link>
                </nav>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">Version: {displayVersion}</p>
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
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
