import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loadItemImage, imageVersion, subscribeImages } from '../lib/productImage';
import { cn } from '../lib/utils';

/** Catalog thumbnail. Loads lazily; shows a placeholder when there is no picture. */
function ProductThumb({ item, className }) {
  const { shopId } = useAuth();
  const want = !!item?.hasImage;
  const [src, setSrc] = useState(null);
  const ver = useSyncExternalStore(subscribeImages, imageVersion);

  useEffect(() => {
    let live = true;
    if (!want) return undefined;
    loadItemImage(shopId, item).then((d) => { if (live) setSrc(d); });
    return () => { live = false; };
  }, [shopId, item, want, ver]);

  const shown = want ? src : null;
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center', className)}>
      {shown ? <img src={shown} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon size={18} className="text-slate-400" />}
    </div>
  );
}

export default memo(ProductThumb);
