import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Home, LogOut, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const handleLogout = () => {
        signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-6 border-b space-y-2">
                    <h1 className="text-xl font-bold text-gray-800">{t('layout.title')}</h1>
                    <p className="text-xs text-gray-500 mt-1">{user?.email}</p>
                    <label className="block text-xs text-gray-600">
                        {t('layout.language')}
                        <select
                            className="mt-1 w-full border rounded px-2 py-1"
                            value={i18n.language}
                            onChange={(e) => i18n.changeLanguage(e.target.value)}
                        >
                            <option value="zh-CN">简体中文</option>
                            <option value="en-US">English</option>
                        </select>
                    </label>
                </div>
                <nav className="px-4 py-4 space-y-2 flex-1">
                    <Link to="/" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Home size={20} /> {t('layout.projects')}
                    </Link>
                    <Link to="/ai" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Sparkles size={20} /> {t('layout.aiAssistant')}
                    </Link>
                    {user?.is_superuser && (
                    <Link to="/users" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Users size={20} /> Users
                    </Link>
                    )}
                </nav>
                <div className="p-4 border-t">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 border rounded px-3 py-2 hover:bg-gray-100">
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
