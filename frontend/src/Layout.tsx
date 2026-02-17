import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Home,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
  Users,
  WandSparkles,
  FileBarChart2,
  Bug,
  FileSearch,
  BookKey,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import { applyThemePreference, getStoredThemePreference, saveThemePreference, type ThemePreference } from './theme';

type VersionPayload = { version: string };

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  children?: Array<{ to: string; label: string; icon?: ComponentType<{ size?: number; className?: string }> }>;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [projectMenuOpen, setProjectMenuOpen] = useState(true);

  useEffect(() => {
    applyThemePreference(themePreference);
    saveThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    let active = true;
    const loadVersion = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/version`);
        if (!response.ok) return;
        const payload = (await response.json()) as VersionPayload;
        if (active && payload.version) setServerVersion(payload.version);
      } catch {
        // no-op
      }
    };
    void loadVersion();
    return () => {
      active = false;
    };
  }, []);

  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/(\d+)/);
    return match?.[1] ?? null;
  }, [location.pathname]);

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      { to: '/', label: t('layout.projects'), icon: Home },
      { to: '/ai', label: t('layout.aiAssistant'), icon: Sparkles },
      { to: '/ai/content', label: t('layout.aiContent'), icon: WandSparkles },
    ];

    if (projectId) {
      items.push({
        to: `/projects/${projectId}`,
        label: 'Project Workspace',
        icon: FolderKanban,
        children: [
          { to: `/projects/${projectId}`, label: 'Dashboard', icon: LayoutDashboard },
          { to: `/projects/${projectId}/site-audit`, label: 'Site Audit', icon: SearchCheck },
          { to: `/projects/${projectId}/pages`, label: 'Pages', icon: FileSearch },
          { to: `/projects/${projectId}/issues`, label: 'Issues', icon: Bug },
          { to: `/projects/${projectId}/keywords`, label: 'Keywords', icon: BookKey },
          { to: `/projects/${projectId}/keyword-research`, label: 'Keyword Research', icon: SearchCheck },
          { to: `/projects/${projectId}/reports`, label: 'Reports', icon: FileBarChart2 },
          { to: `/projects/${projectId}/api-keys`, label: 'API Keys', icon: KeyRound },
        ],
      });
    }

    if (user?.is_superuser) {
      items.push({ to: '/users', label: t('layout.users'), icon: Users });
      items.push({ to: '/settings', label: t('layout.systemSettings'), icon: UserRoundCog });
    }

    items.push({ to: '/change-password', label: t('layout.changePassword'), icon: Settings });
    items.push({ to: '/security/2fa', label: t('layout.twoFactorAuth'), icon: ShieldCheck });
    return items;
  }, [t, user?.is_superuser, projectId]);

  const displayVersion = serverVersion || (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown');

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[color:var(--md-sys-color-surface)] text-[color:var(--md-sys-color-on-surface)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-r border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface-variant)]/45 p-4 lg:p-5">
        <div className="mb-4 rounded-xl border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-4">
          <p className="md-title-medium">{t('layout.title')}</p>
          <p className="md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{user?.email}</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            if (!item.children) {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-[color:var(--md-sys-color-primary)] text-[color:var(--md-sys-color-on-primary)]' : 'hover:bg-[color:var(--md-sys-state-hover)]'}`}
                >
                  <Icon size={16} /> {item.label}
                </NavLink>
              );
            }

            const groupActive = item.children.some((child) => location.pathname === child.to);
            return (
              <div key={item.to} className="rounded-xl border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-2">
                <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium" onClick={() => setProjectMenuOpen((prev) => !prev)}>
                  <item.icon size={16} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {projectMenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {projectMenuOpen && (
                  <div className="mt-1 space-y-1 pl-2">
                    {item.children.map((child) => {
                      const CIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${location.pathname === child.to ? 'bg-[color:var(--md-sys-color-primary-container)] text-[color:var(--md-sys-color-on-primary-container)]' : 'hover:bg-[color:var(--md-sys-state-hover)]'} ${groupActive ? '' : ''}`}
                        >
                          {CIcon ? <CIcon size={14} /> : null}
                          {child.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-3">
          <label className="block text-xs">
            <span className="mb-1 inline-flex items-center gap-1"><Languages size={14} /> {t('layout.language')}</span>
            <select className="app-select w-full" value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
              <option value="zh-CN">{t('layout.langZhCN')}</option>
              <option value="en-US">{t('layout.langEnUS')}</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 inline-flex items-center gap-1"><MonitorCog size={14} /> {t('layout.theme')}</span>
            <select className="app-select w-full" value={themePreference} onChange={(e) => setThemePreference(e.target.value as ThemePreference)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs text-[color:var(--md-sys-color-on-surface-variant)]">Version: {displayVersion}</p>
          <button type="button" onClick={() => { signOut(); navigate('/login'); }} className="app-btn app-btn-outline flex w-full justify-center">
            <LogOut size={16} /> {t('layout.logout')}
          </button>
        </div>
      </aside>

      <main className="overflow-auto p-4 lg:p-6">
        <div className="mx-auto w-full max-w-[1400px] rounded-2xl border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
