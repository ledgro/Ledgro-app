import { Link, useLocation } from 'react-router-dom';
import { House, RotateCcwClock, ChartNoAxesCombined, User, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

const LEFT = [
  { path: '/dashboard', label: 'Home', icon: House },
  { path: '/ledger', label: 'History', icon: RotateCcwClock },
];
const RIGHT = [
  { path: '/pnl', label: 'Statistics', icon: ChartNoAxesCombined },
  { path: '/settings', label: 'Profile', icon: User },
];

function Item({ path, label, icon: Icon, active }) {
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      className={cn('flex h-full flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-300', active ? 'text-blue-600' : 'text-slate-500')}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
      <span className="text-[0.65rem] font-bold tracking-wide">{label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const is = (p) => pathname === p || pathname.startsWith(`${p}/`);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="floating-nav pointer-events-auto relative mx-auto flex h-16 max-w-md items-center rounded-full px-2">
        {LEFT.map((i) => <Item key={i.path} {...i} active={is(i.path)} />)}
        <div className="w-16 flex-shrink-0" aria-hidden="true" />
        {RIGHT.map((i) => <Item key={i.path} {...i} active={is(i.path)} />)}
        <Link
          to="/pos"
          aria-label="New Bill"
          className="absolute left-1/2 -top-5 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.45)] transition-transform duration-200 active:scale-95"
        >
          <Plus size={30} strokeWidth={2.6} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
