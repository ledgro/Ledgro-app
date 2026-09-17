import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Receipt, PieChart, Users } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'POS', icon: LayoutDashboard },
    { path: '/ledger', label: 'Ledger', icon: FileText },
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/analytics', label: 'Analytics', icon: PieChart },
    { path: '/members', label: 'Members', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-40">
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
