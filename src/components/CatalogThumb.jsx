import { useCatalogStore } from '../store/catalogStore';
import ProductThumb from './ProductThumb';

/** Photo of a catalog product by id, for bill screens. Shows nothing when the product has no photo. Never used on receipts. */
export default function CatalogThumb({ catalogId, className }) {
  const item = useCatalogStore((s) => (catalogId ? s.items.find((i) => i.id === catalogId) : null));
  if (!item?.hasImage) return null;
  return <ProductThumb item={item} className={className} />;
}
