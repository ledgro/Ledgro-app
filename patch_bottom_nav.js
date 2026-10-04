import fs from 'fs';

let content = fs.readFileSync('src/components/BottomNav.jsx', 'utf-8');

// Fix BottomNav accessibility, dark mode borders, active states, and replace the bill count logic with unconditional items
const newContent = `import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Menu, Plus, PackageSearch, Receipt, Users, Settings, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { Drawer } from 'vaul';
import { useState } from 'react';
import { useBodyLock } from '../hooks/useBodyLock';

export default function BottomNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useBodyLock(isMoreOpen);

  const leftNavItems = [
    { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { path: '/ledger', label: 'History', icon: FileText },
  ];

  const rightNavItems = [
    { path: '/products', label: 'Products', icon: PackageSearch },
  ];

  const moreItems = [
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/members', label: 'Members', icon: Users },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/pnl', label: 'P&L', icon: TrendingUp },
  ];

  const isMoreActive = moreItems.some(item => location.pathname.startsWith(item.path));

  const NavItem = ({ path, label, icon: Icon, active }) => {
    return (
      <Link
        to={path}
        aria-current={active ? 'page' : undefined}
        className={cn(
          "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
          active ? "text-blue-600" : "text-slate-400"
        )}
      >
        <div className={cn("flex items-center gap-1.5 transition-all flex-col", active ? "text-blue-600" : "text-slate-400")}>
          <Icon size={active ? 22 : 24} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
          <span className="text-[10px] font-bold tracking-wide">{label}</span>
        </div>
      </Link>
    );
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 pb-safe z-40">
        <div className="relative flex justify-between items-center h-[64px] px-2">

          {/* Left Items */}
          <div className="flex w-[40%] justify-around items-center h-full">
            {leftNavItems.map((item) => (
              <NavItem key={item.path} {...item} active={location.pathname === item.path} />
            ))}
          </div>

          {/* Center Elevated FAB (New Bill) */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-6 flex justify-center w-[20%]">
            <Link
              to="/pos"
              aria-label="New Bill"
              className={cn(
                "flex flex-col items-center justify-center transition-transform active:scale-95",
                location.pathname === '/pos' ? "scale-105" : ""
              )}
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.4)] border-[6px] border-slate-50 dark:border-slate-900">
                <Plus size={32} strokeWidth={3} aria-hidden="true" />
              </div>
              <span className={cn("text-[10px] font-bold tracking-wide mt-1", location.pathname === '/pos' ? "text-blue-600" : "text-slate-500")}>Sell</span>
            </Link>
          </div>

          {/* Right Items */}
          <div className="flex w-[40%] justify-around items-center h-full">
            {rightNavItems.map((item) => (
              <NavItem key={item.path} {...item} active={location.pathname === item.path} />
            ))}

            {/* More Menu Button */}
            <button
              onClick={() => setIsMoreOpen(true)}
              aria-label="More options"
              aria-expanded={isMoreOpen}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isMoreActive ? "text-blue-600" : "text-slate-400"
              )}
            >
              <div className="flex items-center gap-1.5 transition-all flex-col">
                <Menu size={isMoreActive ? 22 : 24} strokeWidth={isMoreActive ? 2.5 : 2} aria-hidden="true" />
                <span className="text-[10px] font-bold tracking-wide">More</span>
              </div>
            </button>
          </div>

        </div>
      </nav>

      {/* More Drawer */}
      <Drawer.Root open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content className="bg-white dark:bg-slate-900 flex flex-col rounded-t-[24px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-[60] focus:outline-none pb-safe">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-t-[24px] flex-1">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 dark:bg-slate-800 mb-6" />
              <div className="max-w-md mx-auto">
                <Drawer.Title className="font-semibold text-slate-900 dark:text-slate-100 mb-6 text-xl px-2">
                  More Options
                </Drawer.Title>

                <div className="space-y-2">
                  {moreItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMoreOpen(false)}
                      className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-3 rounded-full">
                        <item.icon size={24} aria-hidden="true" />
                      </div>
                      <span className="font-medium text-slate-900 dark:text-slate-100 text-lg">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
`;

fs.writeFileSync('src/components/BottomNav.jsx', newContent);
