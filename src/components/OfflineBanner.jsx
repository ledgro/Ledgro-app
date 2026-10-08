import { useOnline } from '../lib/online';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-center text-sm font-bold py-2"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      OFFLINE — billing and saving are paused until you reconnect
    </div>
  );
}
