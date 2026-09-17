import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FileText, Menu } from 'lucide-react';
import { cn } from '../lib/utils';
import { Drawer } from 'vaul';
import { useState } from 'react';
import { Receipt, Users, PackagePlus } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { path: '/pos', label: 'New Bill', icon: PlusCircle, isPrimary: true },
    { path: '/ledger', label: 'History', icon: FileText },
  ];

  const moreItems = [
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/products', label: 'Add Product', icon: PackagePlus },
    { path: '/members', label: 'Staff', icon: Users },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-40">
        <div className="flex justify-around items-center h-[64px]">
          {navItems.map(({ path, label, icon: Icon, isPrimary }) => {
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
                {isPrimary ? (
                  <div className={cn(
                    "flex items-center justify-center rounded-full p-2",
                    isActive ? "bg-blue-50" : "bg-transparent"
                  )}>
                    <Icon size={28} strokeWidth={2.5} className={isActive ? "text-blue-600" : "text-slate-400"} />
                  </div>
                ) : (
                  <>
                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && <span className="text-[10px] font-semibold">{label}</span>}
                  </>
                )}
              </Link>
            );
          })}

          <button
            onClick={() => setIsMoreOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full space-y-1 text-slate-400 transition-colors"
          >
            <Menu size={24} strokeWidth={2} />
          </button>
        </div>
      </nav>

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
