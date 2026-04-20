import React, { useState } from 'react';
import { useSpendingSummary } from '@/hooks/usePriceHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Store, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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

type Range = '7d' | '30d';

const RANGE_LABEL: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

export default function SpendingPage() {
  const { data: summary, isLoading } = useSpendingSummary();
  const { formatPrice } = useCurrency();
  const [range, setRange] = useState<Range>('30d');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading spending data...
      </div>
    );
  }

  const total = range === '7d' ? summary?.total7d || 0 : summary?.total30d || 0;

  const weeklyData = summary?.byWeek || [];

  const hasAny = (summary?.byWeek?.length || 0) > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Spending</h1>
      </div>

      {/* Range selector */}
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={v => v && setRange(v as Range)}
        className="w-full justify-start gap-1 flex-wrap"
      >
        <ToggleGroupItem value="7d" size="sm" className="text-xs">7 days</ToggleGroupItem>
        <ToggleGroupItem value="30d" size="sm" className="text-xs">30 days</ToggleGroupItem>
      </ToggleGroup>

      {/* Total card */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
            <DollarSign className="w-4.5 h-4.5 text-primary" />
          </div>
          <p className="text-3xl font-display font-bold">{formatPrice(total)}</p>
          <p className="text-xs text-muted-foreground">{RANGE_LABEL[range]}</p>
        </CardContent>
      </Card>

      {/* Chart: monthly for year view, weekly otherwise */}
      {showMonthlyChart ? (
        monthlyData.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Monthly Spending
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
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
        )
      ) : (
        weeklyData.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Weekly Spending
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyData}>
                  <XAxis
                    dataKey="week"
                    tickFormatter={v => {
                      const d = new Date(v);
                      return isNaN(d.getTime()) ? '' : format(d, 'MMM d');
                    }}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    formatter={(value: number) => [formatPrice(value), 'Spent']}
                    labelFormatter={v => {
                      const d = new Date(v as string);
                      return isNaN(d.getTime()) ? String(v) : `Week of ${format(d, 'MMM d')}`;
                    }}
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
        )
      )}

      {/* By store (last 30d) */}
      {summary?.byStore && summary.byStore.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Store className="w-4 h-4 text-info" /> By Store (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie
                    data={summary.byStore}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    strokeWidth={2}
                  >
                    {summary.byStore.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {summary.byStore.slice(0, 5).map((s, i) => (
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
          <h3 className="font-display font-semibold text-foreground">No spending data yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Finish a shopping trip or scan a receipt to start tracking your spending
          </p>
        </div>
      )}
    </div>
  );
}
