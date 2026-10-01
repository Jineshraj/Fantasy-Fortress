import { Search, X } from 'lucide-react'

/**
 * Search box with a clear button. Without it, clearing a query on mobile means
 * select-all + delete; this is used on every screen that filters a list.
 */
export function SearchBox({ value, onChange, placeholder = 'Search…', label }) {
  return (
    <div className="search-wrap" role="search">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  )
}