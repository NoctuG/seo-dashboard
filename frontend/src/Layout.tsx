import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Home, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from './auth';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-6 border-b">
                    <h1 className="text-xl font-bold text-gray-800">SEO Tool</h1>
                    <p className="text-xs text-gray-500 mt-1">{user?.email}</p>
                </div>
                <nav className="px-4 py-4 space-y-2 flex-1">
                    <Link to="/" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Home size={20} /> Projects
                    </Link>
                    <Link to="/ai" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Sparkles size={20} /> AI Assistant
                    </Link>
                </nav>
                <div className="p-4 border-t">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 border rounded px-3 py-2 hover:bg-gray-100">
                        <LogOut size={16} /> 退出登录
                    </button>
                </div>
            </div>
            <div className="flex-1 p-8 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}
