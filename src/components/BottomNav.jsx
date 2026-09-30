import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Menu, Plus, PackageSearch, Receipt, Users, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { Drawer } from 'vaul';
import { useState, useEffect } from 'react';
import { useBodyLock } from '../hooks/useBodyLock';

export default function BottomNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useBodyLock(isMoreOpen);

  const [billCount, setBillCount] = useState(0);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
     setBillCount(parseInt(localStorage.getItem('ledgro-billCount') || '0'));
  }, [location.pathname]);

  const leftNavItems = [
    { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { path: '/ledger', label: 'History', icon: FileText },
  ];

  const rightNavItems = [
    { path: '/products', label: 'Products', icon: PackageSearch },
  ];

  const moreItems = [
    ...(billCount >= 5 ? [{ path: '/expenses', label: 'Expenses', icon: Receipt }] : []),
    { path: '/members', label: 'Members', icon: Users },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-40">
        <div className="relative flex justify-between items-center h-[64px] px-2">

          {/* Left Items */}
          <div className="flex w-[40%] justify-around items-center h-full">
            {leftNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-blue-600" : "text-slate-400"
                  )}
                >
                  <div className={cn("flex items-center gap-1.5 transition-all flex-col", isActive ? "text-blue-600" : "text-slate-400")}>
                    <Icon size={isActive ? 22 : 24} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-bold tracking-wide">{label}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Center Elevated FAB (New Bill) */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-6 flex justify-center w-[20%]">
            <Link
              to="/pos"
              className={cn(
                "flex flex-col items-center justify-center transition-transform active:scale-95",
                location.pathname === '/pos' ? "scale-105" : ""
              )}
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.4)] border-[6px] border-slate-50">
                <Plus size={32} strokeWidth={3} />
              </div>
              <span className={cn("text-[10px] font-bold tracking-wide mt-1", location.pathname === '/pos' ? "text-blue-600" : "text-slate-500")}>Sell</span>
            </Link>
          </div>

          {/* Right Items */}
          <div className="flex w-[40%] justify-around items-center h-full">
            {rightNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-blue-600" : "text-slate-400"
                  )}
                >
                  <div className={cn("flex items-center gap-1.5 transition-all flex-col", isActive ? "text-blue-600" : "text-slate-400")}>
                    <Icon size={isActive ? 22 : 24} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-bold tracking-wide">{label}</span>
                  </div>
                </Link>
              );
            })}

            {/* More Menu Button */}
            <button
              onClick={() => setIsMoreOpen(true)}
              className="flex flex-col items-center justify-center w-full h-full space-y-1 text-slate-400 transition-colors"
            >
              <div className="flex items-center gap-1.5 transition-all flex-col">
                <Menu size={24} strokeWidth={2} />
                <span className="text-[10px] font-bold tracking-wide">More</span>
              </div>
            </button>
          </div>

        </div>
      </nav>

      {/* More Drawer */}
      <Drawer.Root open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-3xl mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none pb-safe">
            <div className="p-4 bg-white rounded-t-3xl flex-1">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
              <div className="max-w-md mx-auto">
                <Drawer.Title className="font-semibold text-slate-900 mb-6 text-xl px-2">
                  More Options
                </Drawer.Title>

                <div className="space-y-2">
                  {moreItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMoreOpen(false)}
                      className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors"
                    >
                      <div className="bg-blue-50 text-blue-600 p-3 rounded-full">
                        <item.icon size={24} />
                      </div>
                      <span className="font-medium text-slate-900 text-lg">{item.label}</span>
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
