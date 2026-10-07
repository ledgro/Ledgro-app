import { useState, useRef, useEffect, useMemo } from 'react';
import { useCatalogStore } from '../store/catalogStore';
import { Search, Plus } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

export default function SearchInput({ onAddItem }) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [customPrice, setCustomPrice] = useState('');

  const search = useCatalogStore((state) => state.search);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Compute results synchronously
  const results = useMemo(() => {
    if (query.trim().length > 0) {
      return search(query).filter(i => i.isActive !== false); // Hide archived items
    }
    return [];
  }, [query, search]);

  useEffect(() => {
    if (query.trim().length > 0) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setCustomPrice(''); // Clear stale price when query empties
    }
  }, [query]);

  // Click outside (use pointerdown for better mobile touch support)
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const handleSelectResult = (item) => {
    onAddItem({
      name: item.name,
      unitPriceAtSale: item.lastUsedPrice || 0,
      catalogId: item.id,
      unit: item.unit
    });
    setQuery('');
    setShowDropdown(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    const normalizedName = query.normalize('NFC').trim().slice(0, 99);
    if (!normalizedName || !customPrice) return;

    const priceNum = parseFloat(customPrice);
    if (isNaN(priceNum) || priceNum <= 0) return; // Prevent negative/zero custom prices

    // See if the user just typed an existing name but didn't click it
    const exactMatch = results.find(r => r.name.normalize('NFC').trim().toLowerCase() === normalizedName.toLowerCase());

    if (exactMatch) {
      handleSelectResult(exactMatch);
      return;
    }

    onAddItem({
      name: normalizedName,
      unitPriceAtSale: Math.round(priceNum * 100), // convert rupees to paise
      unit: 'piece' // Align custom entry unit with default catalog unit
    });

    setQuery('');
    setCustomPrice('');
    setShowDropdown(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        handleSelectResult(results[0]);
      } else {
        // Move focus to price input if new custom item
        const priceInput = document.getElementById('custom-price-input');
        if (priceInput) priceInput.focus();
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full z-20" role="combobox" aria-expanded={showDropdown}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-slate-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          maxLength={100}
          className="block w-full h-14 pl-12 pr-4 border border-slate-200 rounded-2xl shadow-subtle bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium transition-all"
          placeholder="Search items..."
        />
      </div>

      {showDropdown && (
        <div className="absolute mt-2 w-full bg-white shadow-xl rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
          {results.length > 0 ? (
            <div className="max-h-72 overflow-auto" role="listbox">
              {results.map((item) => (
                <button
                  type="button"
                  key={item.id || item.name}
                  onClick={() => handleSelectResult(item)}
                  className="w-full text-left p-4 hover:bg-slate-50 active:bg-slate-100 cursor-pointer flex justify-between items-center transition-colors border-b border-slate-50 last:border-0"
                >
                  <span className="font-semibold text-slate-900 text-lg">{item.name}</span>
                  <span className="text-slate-500 font-medium">{formatCurrency(item.lastUsedPrice)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-5 bg-white">
              <p className="text-sm text-slate-500 font-medium mb-4">Add new product to catalog</p>
              <form onSubmit={handleAddCustom} className="flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400 font-bold">₹</span>
                  </div>
                  <input
                    id="custom-price-input"
                    type="number"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
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