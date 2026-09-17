import { useState, useRef, useEffect } from 'react';
import { useCatalogStore } from '../store/catalogStore';
import { Search, Plus } from 'lucide-react';

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
    onAddItem({ name: item.name, unitPrice: item.lastUsedPrice || 0 });
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
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-lg"
          placeholder="Search items..."
          autoFocus
        />
      </div>

      {showDropdown && (
        <div className="absolute mt-1 w-full bg-white shadow-lg rounded-md border border-gray-100 overflow-hidden">
          {results.length > 0 ? (
            <ul className="max-h-60 overflow-auto divide-y divide-gray-100">
              {results.map((item, idx) => (
                <li
                  key={idx}
                  onClick={() => handleSelectResult(item)}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                >
                  <span className="font-medium text-gray-900">{item.name}</span>
                  <span className="text-gray-500">₹{item.lastUsedPrice}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 bg-gray-50">
              <p className="text-sm text-gray-600 mb-3">"{query}" not found. Add it now:</p>
              <form onSubmit={handleAddCustom} className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">₹</span>
                  </div>
                  <input
                    type="number"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="block w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Price"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
