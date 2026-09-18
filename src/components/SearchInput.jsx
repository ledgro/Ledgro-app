import { useState, useRef, useEffect } from 'react';
import { useCatalogStore } from '../store/catalogStore';
import { Search, Plus } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

export default function SearchInput({ onAddItem }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const search = useCatalogStore((state) => state.search);
  const wrapperRef = useRef(null);

  // Custom item state if no results match
  const [customPrice, setCustomPrice] = useState('');

  useEffect(() => {
    if (query.trim().length > 0) {
      const res = search(query.trim());
      setResults(res.slice(0, 5)); // show top 5 matches
      setShowDropdown(true);
    } else {
      setResults([]);
      setShowDropdown(false);
    }
  }, [query, search]);

  useEffect(() => {
    // Click outside to close dropdown
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelectResult = (item) => {
    onAddItem({ name: item.name, unitPrice: item.lastUsedPrice || 0, catalogId: item.id });
    setQuery('');
    setShowDropdown(false);
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!query.trim() || !customPrice) return;

    const priceNum = parseFloat(customPrice);
    if (isNaN(priceNum)) return;

    onAddItem({ name: query.trim(), unitPrice: priceNum });
    setQuery('');
    setCustomPrice('');
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full z-20">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-slate-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full h-14 pl-12 pr-4 border border-slate-200 rounded-2xl shadow-subtle bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium transition-all"
          placeholder="Search items..."
          autoFocus
        />
      </div>

      {showDropdown && (
        <div className="absolute mt-2 w-full bg-white shadow-xl rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
          {results.length > 0 ? (
            <ul className="max-h-72 overflow-auto">
              {results.map((item, idx) => (
                <li
                  key={idx}
                  onClick={() => handleSelectResult(item)}
                  className="p-4 hover:bg-slate-50 active:bg-slate-100 cursor-pointer flex justify-between items-center transition-colors"
                >
                  <span className="font-semibold text-slate-900 text-lg">{item.name}</span>
                  <span className="text-slate-500 font-medium">{formatCurrency(item.lastUsedPrice)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5 bg-white">
              <p className="text-sm text-slate-500 font-medium mb-4">Add new product to catalog</p>
              <form onSubmit={handleAddCustom} className="flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400 font-bold">₹</span>
                  </div>
                  <input
                    type="number"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="block w-full h-12 pl-8 pr-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-bold transition-all"
                    placeholder="0.00"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!customPrice}
                  className="inline-flex items-center h-12 px-6 rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  <Plus className="h-5 w-5 mr-1.5" /> Add
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
