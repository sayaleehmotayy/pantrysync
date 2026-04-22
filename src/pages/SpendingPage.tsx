import React, { useMemo, useState } from 'react';
import { useSpendingSummary } from '@/hooks/usePriceHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Store, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addWeeks, addMonths, addYears, isSameWeek, isSameMonth, isSameYear } from 'date-fns';
import { useCurrency } from '@/lib/currency';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

type View = 'weekly' | 'monthly' | 'yearly';

export default function SpendingPage() {
  const { data: summary, isLoading } = useSpendingSummary();
  const { formatPrice } = useCurrency();
  const [view, setView] = useState<View>('monthly');
  // Anchor date that the user is browsing — start at "today".
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Derive the period start/end + label from the view + anchor.
  const period = useMemo(() => {
    if (view === 'weekly') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 }); // Monday
      const end = endOfWeek(anchor, { weekStartsOn: 1 });
      return {
        start,
        end,
        label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
        isCurrent: isSameWeek(anchor, new Date(), { weekStartsOn: 1 }),
      };
    }
    if (view === 'monthly') {
      const start = startOfMonth(anchor);
      const end = endOfMonth(anchor);
      return {
        start,
        end,
        label: format(start, 'MMMM yyyy'),
        isCurrent: isSameMonth(anchor, new Date()),
      };
    }
    const start = startOfYear(anchor);
    const end = endOfYear(anchor);
    return {
      start,
      end,
      label: format(start, 'yyyy'),
      isCurrent: isSameYear(anchor, new Date()),
    };
  }, [view, anchor]);

  const goPrev = () => {
    if (view === 'weekly') setAnchor(addWeeks(anchor, -1));
    else if (view === 'monthly') setAnchor(addMonths(anchor, -1));
    else setAnchor(addYears(anchor, -1));
  };
  const goNext = () => {
    if (view === 'weekly') setAnchor(addWeeks(anchor, 1));
    else if (view === 'monthly') setAnchor(addMonths(anchor, 1));
    else setAnchor(addYears(anchor, 1));
  };

  // Filter entries to the chosen period and bucket appropriately.
  const { totalForPeriod, chartData, byStore } = useMemo(() => {
    const empty = { totalForPeriod: 0, chartData: [] as { key: string; label: string; total: number }[], byStore: [] as { name: string; total: number }[] };
    if (!summary?.entries) return empty;

    const entries = summary.entries.filter(e => {
      const d = new Date(e.date);
      return d >= period.start && d <= period.end;
    });

    const total = entries.reduce((s, e) => s + e.amount, 0);

    const storeMap = new Map<string, number>();
    entries.forEach(e => storeMap.set(e.store, (storeMap.get(e.store) || 0) + e.amount));
    const byStore = Array.from(storeMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

    let chartData: { key: string; label: string; total: number }[] = [];

    if (view === 'weekly') {
      // 7 daily buckets, Mon..Sun
      const buckets = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(period.start);
        d.setDate(d.getDate() + i);
        buckets.set(format(d, 'yyyy-MM-dd'), 0);
      }
      entries.forEach(e => {
        const k = format(new Date(e.date), 'yyyy-MM-dd');
        buckets.set(k, (buckets.get(k) || 0) + e.amount);
      });
      chartData = Array.from(buckets.entries()).map(([key, total]) => ({
        key,
        label: format(new Date(key), 'EEE'),
        total,
      }));
    } else if (view === 'monthly') {
      // Daily buckets across the month
      const buckets = new Map<string, number>();
      const days = (endOfMonth(period.start).getDate());
      for (let i = 1; i <= days; i++) {
        const d = new Date(period.start.getFullYear(), period.start.getMonth(), i);
        buckets.set(format(d, 'yyyy-MM-dd'), 0);
      }
      entries.forEach(e => {
        const k = format(new Date(e.date), 'yyyy-MM-dd');
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + e.amount);
      });
      chartData = Array.from(buckets.entries()).map(([key, total]) => ({
        key,
        label: format(new Date(key), 'd'),
        total,
      }));
    } else {
      // Yearly: 12 monthly buckets
      const buckets = new Map<string, number>();
      for (let m = 0; m < 12; m++) {
        const d = new Date(period.start.getFullYear(), m, 1);
        buckets.set(format(d, 'yyyy-MM'), 0);
      }
      entries.forEach(e => {
        const d = new Date(e.date);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + e.amount);
      });
      chartData = Array.from(buckets.entries()).map(([key, total]) => {
        const [y, m] = key.split('-').map(Number);
        return { key, label: format(new Date(y, m - 1, 1), 'MMM'), total };
      });
    }

    return { totalForPeriod: total, chartData, byStore };
  }, [summary, period, view]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading spending data...
      </div>
    );
  }

  const hasAny = chartData.some(d => d.total > 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Spending</h1>
      </div>

      {/* View picker */}
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={v => v && setView(v as View)}
        className="w-full justify-start gap-1 flex-wrap"
      >
        <ToggleGroupItem value="weekly" size="sm" className="text-xs">Weekly</ToggleGroupItem>
        <ToggleGroupItem value="monthly" size="sm" className="text-xs">Monthly</ToggleGroupItem>
        <ToggleGroupItem value="yearly" size="sm" className="text-xs">Yearly</ToggleGroupItem>
      </ToggleGroup>

      {/* Period navigator */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={goPrev} className="h-8 w-8 shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium">{period.label}</p>
          {!period.isCurrent && (
            <button
              className="text-[10px] text-primary hover:underline"
              onClick={() => setAnchor(new Date())}
            >
              Jump to today
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={goNext}
          disabled={period.isCurrent}
          className="h-8 w-8 shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Total card */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
            <DollarSign className="w-4.5 h-4.5 text-primary" />
          </div>
          <p className="text-3xl font-display font-bold">{formatPrice(totalForPeriod)}</p>
          <p className="text-xs text-muted-foreground capitalize">{view} total · {period.label}</p>
        </CardContent>
      </Card>

      {/* Period chart */}
      {hasAny && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              {view === 'weekly' && 'Daily Spending'}
              {view === 'monthly' && 'Daily Spending'}
              {view === 'yearly' && 'Monthly Spending'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={view === 'monthly' ? 2 : 0}
                />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  formatter={(value: number) => [formatPrice(value), 'Spent']}
                  contentStyle={{
                    borderRadius: '8px',
                    fontSize: '12px',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                  }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* By store */}
      {byStore.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Store className="w-4 h-4 text-info" /> By Store
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie
                    data={byStore}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    strokeWidth={2}
                  >
                    {byStore.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {byStore.slice(0, 5).map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="font-medium text-xs ml-2">{formatPrice(s.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground">No spending in this period</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Try a different week, month, or year — or finish a shopping trip / scan a receipt.
          </p>
        </div>
      )}
    </div>
  );
}
