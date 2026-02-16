import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    Home,
    KeyRound,
    LogOut,
    Menu,
    MonitorCog,
    Settings,
    ShieldCheck,
    Sparkles,
    Users,
    X,
    WandSparkles,
    PanelsTopLeft,
    Languages,
} from 'lucide-react';
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

type NavItem = {
    to: string;
    label: string;
    icon: ComponentType<{ size?: number; className?: string }>;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [serverVersion, setServerVersion] = useState<string | null>(null);
    const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
    const [menuOpen, setMenuOpen] = useState(false);

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

    const navItems = useMemo<NavItem[]>(() => {
        const items: NavItem[] = [
            { to: '/', label: t('layout.projects'), icon: Home },
            { to: '/ai', label: t('layout.aiAssistant'), icon: Sparkles },
            { to: '/ai/content', label: t('layout.aiContent'), icon: WandSparkles },
            { to: '/change-password', label: t('layout.changePassword'), icon: KeyRound },
            { to: '/security/2fa', label: t('layout.twoFactorAuth'), icon: ShieldCheck },
        ];

        if (user?.is_superuser) {
            items.splice(3, 0, { to: '/users', label: t('layout.users'), icon: Users });
            items.splice(4, 0, { to: '/settings', label: t('layout.systemSettings'), icon: Settings });
        }

        return items;
    }, [t, user?.is_superuser]);

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

    const onNavigateFromMenu = () => {
        setMenuOpen(false);
    };

    return (
        <div className="relative flex min-h-screen bg-[radial-gradient(circle_at_20%_20%,#e0f2fe_0%,#f8fafc_42%,#f8fafc_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_20%_20%,#0b1728_0%,#020617_45%,#020617_100%)] dark:text-slate-100">
            <div className="absolute right-4 top-4 z-40 md:right-6 md:top-6">
                <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-lg shadow-sky-100/70 backdrop-blur-md transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-none"
                >
                    {menuOpen ? <X size={16} /> : <Menu size={16} />}
                    {menuOpen ? t('layout.collapseMenu') : t('layout.expandMenu')}
                </button>
            </div>

            {menuOpen && (
                <button
                    type="button"
                    aria-label={t('layout.closeMenu')}
                    onClick={() => setMenuOpen(false)}
                    className="absolute inset-0 z-20 bg-slate-900/20 backdrop-blur-[2px]"
                />
            )}

            <main className="relative z-10 flex-1 overflow-auto p-4 pr-6 md:p-8 md:pr-20">
                <div className="mx-auto w-full max-w-6xl rounded-[2rem] border border-white/60 bg-white/80 p-4 shadow-[0_24px_64px_-24px_rgba(15,23,42,0.35)] backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70 md:p-6">
                    <Outlet />
                </div>
            </main>

            <aside
                className={`absolute right-0 top-0 z-30 h-full w-full max-w-sm transform border-l border-white/60 bg-white/90 p-6 shadow-2xl backdrop-blur-xl transition-transform duration-300 dark:border-slate-700 dark:bg-slate-900/90 ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="flex h-full flex-col gap-5">
                    <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
                        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-300">
                            <PanelsTopLeft size={14} /> {t('layout.title')}
                        </p>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{user?.email}</p>
                    </div>

                    <nav className="rounded-3xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                        <ul className="space-y-1.5">
                            {navItems.map(({ to, label, icon: Icon }) => (
                                <li key={to}>
                                    <NavLink
                                        to={to}
                                        onClick={onNavigateFromMenu}
                                        className={({ isActive }) =>
                                            `flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition ${
                                                isActive
                                                    ? 'bg-sky-500 text-white shadow-md shadow-sky-200 dark:shadow-none'
                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                            }`
                                        }
                                    >
                                        <Icon size={18} />
                                        {label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-300">
                            <span className="mb-1 inline-flex items-center gap-1">
                                <Languages size={14} /> {t('layout.language')}
                            </span>
                            <select
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                value={i18n.language}
                                onChange={(e) => i18n.changeLanguage(e.target.value)}
                            >
                                <option value="zh-CN">{t('layout.langZhCN')}</option>
                                <option value="en-US">{t('layout.langEnUS')}</option>
                            </select>
                        </label>

                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-300">
                            <span className="mb-1 inline-flex items-center gap-1">
                                <MonitorCog size={14} /> {t('layout.theme')}
                            </span>
                            <select
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                value={themePreference}
                                onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
                            >
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                                <option value="system">System</option>
                            </select>
                        </label>
                    </div>

                    <div className="mt-auto space-y-3">
                        <p className="text-center text-xs text-slate-500 dark:text-slate-400">Version: {displayVersion}</p>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            <LogOut size={16} /> {t('layout.logout')}
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}
