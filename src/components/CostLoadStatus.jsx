import { useCostStore } from '../store/costStore';
import { useAuth } from '../context/AuthContext';
import { loadCosts } from '../hooks/useCostsLoader';

/** Under a cost box: says why it is greyed out, and lets the owner retry. Renders nothing once loaded. */
export default function CostLoadStatus() {
  const { shopId } = useAuth();
  const loaded = useCostStore((s) => s.loaded);
  const error = useCostStore((s) => s.error);
  if (loaded) return null;
  if (error) {
    return <button type="button" onClick={() => loadCosts(shopId)} className="mt-1 flex min-h-[44px] items-center text-sm font-bold text-red-600">Couldn't load costs. Tap to retry</button>;
  }
  return <p role="status" className="mt-1 text-xs font-semibold text-slate-500">Loading costs...</p>;
}
