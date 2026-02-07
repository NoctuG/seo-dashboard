import { Outlet, Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function Layout() {
    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200">
                <div className="p-6">
                    <h1 className="text-xl font-bold text-gray-800">SEO Tool</h1>
                </div>
                <nav className="px-4 space-y-2">
                    <Link to="/" className="flex items-center gap-2 p-2 text-gray-700 hover:bg-gray-100 rounded">
                        <Home size={20} /> Projects
                    </Link>
                </nav>
            </div>
            {/* Main */}
            <div className="flex-1 p-8 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}
