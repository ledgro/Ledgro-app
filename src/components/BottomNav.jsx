import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { House, RotateCcwClock, ChartNoAxesCombined, User, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

const ITEMS = [
  { path: '/dashboard', label: 'Home', icon: House },
  { path: '/ledger', label: 'History', icon: RotateCcwClock },
  { path: '/pnl', label: 'Statistics', icon: ChartNoAxesCombined },
  { path: '/settings', label: 'Profile', icon: User },
];

const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };

export default function BottomNav() {
  const { pathname } = useLocation();
  const is = (p) => pathname === p || pathname.startsWith(`${p}/`);
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="floating-nav pointer-events-auto flex h-16 flex-1 items-center rounded-full p-1.5">
          {ITEMS.map(({ path, label, icon: Icon }) => {
            const active = is(path);
            return (
              <Link
                key={path}
                to={path}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn('press relative flex h-full flex-1 items-center justify-center rounded-full transition-colors duration-300', active ? 'text-blue-600' : 'text-slate-500')}
              >
                {active && <motion.span layoutId="nav-pill" transition={SPRING} className="nav-pill absolute inset-0 rounded-full" />}
                <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" className="relative" />
              </Link>
            );
          })}
        </div>
        <Link
          to="/pos"
          aria-label="New Bill"
          className="press pointer-events-auto flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_8px_22px_rgba(37,99,235,0.5)]"
        >
          <Plus size={28} strokeWidth={2.6} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
