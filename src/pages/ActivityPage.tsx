import React from 'react';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

export default function ActivityPage() {
  const { data: activities = [], isLoading, getMemberName } = useActivityLog(100);

  // Group by day
  const grouped: Record<string, typeof activities> = {};
  for (const a of activities) {
    const d = new Date(a.created_at);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy');
    (grouped[key] = grouped[key] || []).push(a);
  }

  const actionEmoji: Record<string, string> = {
    added: '➕',
    removed: '🗑️',
    used: '📦',
    updated: '✏️',
    bought: '🛒',
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-display font-bold">Activity</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No activity yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Actions will show up here</p>
        </div>
      ) : (
        Object.entries(grouped).map(([day, entries]) => (
          <div key={day} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{day}</h3>
            <Card className="border-border/50 shadow-none">
              <CardContent className="p-0 divide-y divide-border/50">
                {entries.map(a => (
                  <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-base mt-0.5">{actionEmoji[a.action] || '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{getMemberName(a.user_id)}</span>{' '}
                        <span className="text-muted-foreground">{a.action}</span>{' '}
                        {a.item_name && <span className="font-medium">{a.item_name}</span>}
                      </p>
                      {a.details && <p className="text-xs text-muted-foreground mt-0.5">{a.details}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                      {format(new Date(a.created_at), 'h:mm a')}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
