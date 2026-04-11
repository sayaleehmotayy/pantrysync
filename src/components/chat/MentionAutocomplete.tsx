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

const MentionAutocomplete = React.forwardRef<HTMLDivElement, MentionAutocompleteProps>(function MentionAutocomplete(
  { options, onSelect, position, filter },
  ref,
) {
  const normalizedFilter = filter.trim().toLowerCase();
  const filtered = options.filter((option) => {
    const label = option.label.trim().toLowerCase();
    return normalizedFilter.length === 0 || label.includes(normalizedFilter);
  });

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ bottom: position.top, left: position.left, minWidth: 200, maxWidth: 280 }}
    >
      <div className="py-1 max-h-48 overflow-y-auto">
        {filtered.map((option) => {
          const label = option.label.trim();
          return (
            <button
              key={option.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ ...option, label });
              }}
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  option.isEveryone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {option.isEveryone ? '👥' : label.charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default MentionAutocomplete;
