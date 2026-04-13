import React, { useState, useRef, useMemo } from 'react';
import { useReceiptScanner, ReceiptItem } from '@/hooks/useReceiptScanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Camera, Upload, Receipt, ShoppingBasket, BarChart3, Loader2, ArrowLeft, Store, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC', '#1B4332', '#081C15', '#A7C957'];

type Tab = 'scan' | 'history' | 'analytics';

export default function ReceiptScannerPage() {
  const {
    scanning, scanResult, setScanResult, scanReceipt,
    addSelectedToPantry, history, analytics, isLoadingHistory,
  } = useReceiptScanner();

  const [tab, setTab] = useState<Tab>('scan');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageCapture = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const result = await scanReceipt(base64);
        setItems(result.items.map(i => ({ ...i, selected: true })));
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageCapture(file);
    e.target.value = '';
  };

  const toggleItem = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const handleAddToPantry = async () => {
    setAdding(true);
    await addSelectedToPantry(items);
    setAdding(false);
    setScanResult(null);
    setItems([]);
  };

  const selectedCount = items.filter(i => i.selected).length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" /> Receipt Scanner
        </h1>
        <Badge variant="default" className="bg-primary/10 text-primary text-[10px]">PRO</Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {([
          { key: 'scan', label: 'Scan', icon: Camera },
          { key: 'history', label: 'History', icon: Receipt },
          { key: 'analytics', label: 'Insights', icon: BarChart3 },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Scan Tab */}
      {tab === 'scan' && (
        <>
          {!scanResult && !scanning && (
            <Card className="border-dashed border-2 border-primary/30">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-display font-semibold">Scan a Receipt</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Take a photo or upload an image. AI will extract all items, prices, and store info.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Upload className="w-4 h-4" /> Upload Photo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {scanning && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="font-display font-semibold">Analyzing receipt...</p>
                <p className="text-sm text-muted-foreground">AI is extracting items and prices</p>
              </CardContent>
            </Card>
          )}

          {scanResult && items.length > 0 && (
            <div className="space-y-3">
              {/* Receipt summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {scanResult.store_name && (
                        <p className="font-display font-bold flex items-center gap-1.5">
                          <Store className="w-4 h-4 text-primary" /> {scanResult.store_name}
                        </p>
                      )}
                      {scanResult.receipt_date && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> {format(new Date(scanResult.receipt_date), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    {scanResult.total_amount && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold text-primary">
                          {scanResult.currency === 'USD' ? '$' : scanResult.currency === 'EUR' ? '€' : scanResult.currency === 'GBP' ? '£' : ''}{scanResult.total_amount.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Items list */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Items Found ({items.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setItems(prev => prev.map(i => ({ ...i, selected: !prev.every(p => p.selected) })))}
                >
                  {items.every(i => i.selected) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              {items.map((item, idx) => (
                <Card key={idx} className={`border-border/50 shadow-none transition-opacity ${!item.selected ? 'opacity-50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleItem(idx)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                          <Badge variant="outline" className="text-[10px] h-4">{item.category}</Badge>
                        </div>
                      </div>
                      {item.total_price != null && (
                        <p className="text-sm font-semibold shrink-0">
                          ${item.total_price.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Action buttons */}
              <div className="flex gap-2 sticky bottom-20 md:bottom-4 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setScanResult(null); setItems([]); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> New Scan
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleAddToPantry}
                  disabled={adding || selectedCount === 0}
                >
                  <ShoppingBasket className="w-4 h-4" />
                  {adding ? 'Adding...' : `Add ${selectedCount} to Pantry`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No receipts scanned yet</p>
            </div>
          ) : (
            history.map((scan: any) => (
              <Card key={scan.id} className="border-border/50 shadow-none">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{scan.store_name || 'Unknown Store'}</p>
                      <p className="text-xs text-muted-foreground">
                        {scan.receipt_date ? format(new Date(scan.receipt_date), 'MMM d, yyyy') : format(new Date(scan.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {scan.total_amount && (
                      <p className="font-bold text-sm">
                        {scan.currency === 'USD' ? '$' : scan.currency === 'EUR' ? '€' : ''}{scan.total_amount.toFixed(2)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {!analytics || analytics.totalReceipts === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Scan some receipts to see spending insights</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <DollarSign className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">${analytics.totalSpent.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Spent</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <Receipt className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">{analytics.totalReceipts}</p>
                    <p className="text-[10px] text-muted-foreground">Receipts</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <ShoppingBasket className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">{analytics.totalItems}</p>
                    <p className="text-[10px] text-muted-foreground">Items</p>
                  </CardContent>
                </Card>
              </div>

              {/* Category breakdown */}
              {Object.keys(analytics.categorySpending).length > 0 && (
                <Card className="border-border/50 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display">Spending by Category</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={Object.entries(analytics.categorySpending).map(([name, value]) => ({ name, value }))}
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {Object.keys(analytics.categorySpending).map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Store breakdown */}
              {Object.keys(analytics.storeSpending).length > 0 && (
                <Card className="border-border/50 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display">Spending by Store</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.entries(analytics.storeSpending).map(([name, value]) => ({ name, value }))}>
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Monthly trend */}
              {Object.keys(analytics.monthlySpending).length > 1 && (
                <Card className="border-border/50 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display">Monthly Spending</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.entries(analytics.monthlySpending).map(([name, value]) => ({ name, value }))}>
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
