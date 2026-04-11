import React from 'react';

interface MentionOption {
  id: string;
  label: string;
  isEveryone?: boolean;
}

interface MentionAutocompleteProps {
  options: MentionOption[];
  onSelect: (option: MentionOption) => void;
  position: { top: number; left: number };
  filter: string;
}

export default function MentionAutocomplete({ options, onSelect, position, filter }: MentionAutocompleteProps) {
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ bottom: position.top, left: position.left, minWidth: 200, maxWidth: 280 }}
    >
      <div className="py-1 max-h-48 overflow-y-auto">
        {filtered.map(option => (
          <button
            key={option.id}
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
            onMouseDown={(e) => { e.preventDefault(); onSelect(option); }}
          >
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              option.isEveryone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {option.isEveryone ? '👥' : option.label.charAt(0).toUpperCase()}
            </span>
            <span className="truncate font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
