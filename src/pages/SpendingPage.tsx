import React, { useState } from 'react';
import { useSpendingSummary, usePriceHistory } from '@/hooks/usePriceHistory';
import { useInventory } from '@/hooks/useInventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, TrendingDown, Store, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency';

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

export default function SpendingPage() {
  const { data: summary, isLoading } = useSpendingSummary();
  const { data: items = [] } = useInventory();
  const { addPrice } = usePriceHistory();
  const { formatPrice } = useCurrency();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState('');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');

  const handleAddPrice = () => {
    if (!selectedItem || !price) return;
    addPrice.mutate({
      inventory_item_id: selectedItem,
      price: Number(price),
      store_name: store || undefined,
    });
    setAddOpen(false);
    setPrice('');
    setStore('');
    setSelectedItem('');
  };

  // Items with prices for the "recent prices" list
  const itemsWithPrices = items
    .filter((i: any) => i.last_price)
    .sort((a: any, b: any) => (b.last_price || 0) - (a.last_price || 0));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Loading spending data...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Spending</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Log Price
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <DollarSign className="w-4.5 h-4.5 text-primary" />
            </div>
            <p className="text-2xl font-display font-bold">
              {formatPrice(summary?.total7d || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center mb-2">
              <TrendingUp className="w-4.5 h-4.5 text-info" />
            </div>
            <p className="text-2xl font-display font-bold">
              {formatPrice(summary?.total30d || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly spending chart */}
      {summary?.byWeek && summary.byWeek.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Weekly Spending
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={summary.byWeek}>
                <XAxis
                  dataKey="week"
                  tickFormatter={v => format(new Date(v), 'MMM d')}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(value: number) => [formatPrice(value), 'Spent']}
                  labelFormatter={v => `Week of ${format(new Date(v), 'MMM d')}`}
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
      {summary?.byStore && summary.byStore.length > 0 && (
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

      {/* Items with prices */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" /> Item Prices
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {itemsWithPrices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No prices logged yet. Tap "Log Price" to start tracking.
            </p>
          ) : (
            <div className="space-y-2">
              {itemsWithPrices.slice(0, 10).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{item.name}</span>
                    {item.last_store && (
                      <span className="text-[10px] text-muted-foreground">{item.last_store}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs ml-2">
                    {formatPrice(item.last_price)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state */}
      {(!summary?.byWeek || summary.byWeek.length === 0) && itemsWithPrices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground">No spending data yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Log prices when you buy groceries to track your spending over time
          </p>
          <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Log your first price
          </Button>
        </div>
      )}

      {/* Add price dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Item Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Item</label>
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger><SelectValue placeholder="Select pantry item" /></SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Price</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Store</label>
                <Input
                  placeholder="e.g. Walmart"
                  value={store}
                  onChange={e => setStore(e.target.value)}
                />
              </div>
            </div>
            <Button className="w-full" onClick={handleAddPrice} disabled={!selectedItem || !price}>
              Save Price
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
