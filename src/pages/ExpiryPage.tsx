import React from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { format, differenceInDays, isBefore, addDays } from 'date-fns';
import { formatQty } from '@/lib/utils';

type ExpiryStatus = 'expired' | 'expiring' | 'safe';

// Parse 'YYYY-MM-DD' as a LOCAL calendar date to avoid UTC off-by-one.
function parseExpiry(dateStr: string): Date {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(dateStr);
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function getExpiryStatus(date: string): ExpiryStatus {
  const d = parseExpiry(date);
  const today = startOfToday();
  if (isBefore(d, today)) return 'expired';
  if (isBefore(d, addDays(today, 3))) return 'expiring';
  return 'safe';
}

const statusConfig: Record<ExpiryStatus, { label: string; icon: React.ElementType; color: string; badgeClass: string }> = {
  expired: { label: 'Expired', icon: XCircle, color: 'text-destructive', badgeClass: 'bg-destructive/10 text-destructive' },
  expiring: { label: 'Expiring Soon', icon: AlertTriangle, color: 'text-warning', badgeClass: 'bg-warning/10 text-warning' },
  safe: { label: 'Safe', icon: CheckCircle, color: 'text-primary', badgeClass: 'bg-primary/10 text-primary' },
};

export default function ExpiryPage() {
  const { data: items = [], isLoading } = useInventory();

  const withExpiry = items.filter(i => i.expiry_date);
  const withoutExpiry = items.filter(i => !i.expiry_date);

  const grouped: Record<ExpiryStatus, InventoryItem[]> = { expired: [], expiring: [], safe: [] };
  for (const item of withExpiry) {
    const status = getExpiryStatus(item.expiry_date!);
    grouped[status].push(item);
  }

  // Sort each group by expiry date
  for (const key of Object.keys(grouped) as ExpiryStatus[]) {
    grouped[key].sort((a, b) => parseExpiry(a.expiry_date!).getTime() - parseExpiry(b.expiry_date!).getTime());
  }

  const sections: ExpiryStatus[] = ['expired', 'expiring', 'safe'];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Expiry Tracker</h1>
        <Badge variant="outline" className="text-xs">{withExpiry.length} tracked</Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
      ) : withExpiry.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No expiry dates tracked</h3>
          <p className="text-muted-foreground text-sm mt-1">Add expiry dates when adding pantry items</p>
        </div>
      ) : (
        sections.map(status => {
          const sectionItems = grouped[status];
          if (sectionItems.length === 0) return null;
          const config = statusConfig[status];
          const Icon = config.icon;

          return (
            <div key={status} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                {config.label} ({sectionItems.length})
              </h3>
              {sectionItems.map(item => {
                const days = differenceInDays(new Date(item.expiry_date!), new Date());
                return (
                  <Card key={item.id} className="border-border/50 shadow-none">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatQty(item.quantity)} {item.unit} · {item.storage_location}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeClass}`}>
                          {status === 'expired'
                            ? `${Math.abs(days)}d ago`
                            : days === 0
                            ? 'Today'
                            : `${days}d left`}
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(item.expiry_date!), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
