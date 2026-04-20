import React, { useState, useMemo } from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { useShoppingList } from '@/hooks/useShoppingList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Package, Minus, ShoppingCart, AlertTriangle, Camera, Lock } from 'lucide-react';
import { useProAccess } from '@/hooks/useProAccess';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format, isBefore, addDays } from 'date-fns';
import { toast } from 'sonner';
import ProductScanner from '@/components/ProductScanner';
import { formatQty } from '@/lib/utils';

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Frozen', 'Sauces', 'Other'];
const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp', 'bottles', 'packets'];
const LOCATIONS = ['pantry', 'fridge', 'freezer'];

function ItemForm({ onSubmit, initial, submitLabel }: {
  onSubmit: (item: { name: string; quantity: number; unit: string; category: string; expiry_date?: string | null; storage_location?: string; min_threshold?: number }) => void;
  initial?: Partial<InventoryItem>;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [quantity, setQuantity] = useState(String(initial?.quantity || ''));
  const [unit, setUnit] = useState(initial?.unit || '');
  const [category, setCategory] = useState(initial?.category || 'Other');
  const [expiryDate, setExpiryDate] = useState(initial?.expiry_date || '');
  const [location, setLocation] = useState(initial?.storage_location || 'pantry');
  const [minThreshold, setMinThreshold] = useState(String(initial?.min_threshold || '0'));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, quantity: Number(quantity), unit, category, expiry_date: expiryDate || null, storage_location: location, min_threshold: Number(minThreshold) }); }} className="space-y-4">
      <Input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} required />
      <div className="flex gap-3">
        <Input type="number" placeholder="Qty" value={quantity} onChange={e => setQuantity(e.target.value)} required min="0" step="any" className="flex-1" />
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-28"><SelectValue placeholder="Units" /></SelectTrigger>
          <SelectContent side="bottom" position="popper">{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-3">
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent side="bottom" position="popper">{LOCATIONS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Type of item" /></SelectTrigger>
          <SelectContent side="bottom" position="popper">{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Expiry date</label>
          <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Low stock alert</label>
          <Input type="number" placeholder="Min qty" value={minThreshold} onChange={e => setMinThreshold(e.target.value)} min="0" step="any" />
        </div>
      </div>
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );
}

function QuickActions({ item, onUse, onRestock }: { item: InventoryItem; onUse: (amount: number, action: string) => void; onRestock: () => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUse(1, 'Used 1')}>
        <Minus className="w-3 h-3 mr-1" /> 1
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUse(0.5, 'Used half')}>
        Half
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onUse(item.quantity, 'Finished')}>
        Finished
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRestock}>
        <ShoppingCart className="w-3 h-3 mr-1" /> Restock
      </Button>
    </div>
  );
}

export default function PantryPage() {
  const { data: items = [], isLoading, addItem, updateItem, deleteItem, quickUse } = useInventory();
  const { addItem: addShoppingItem } = useShoppingList();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { isPro, gate } = useProAccess();
  const openScanner = () => { if (gate('Product scanning')) setScannerOpen(true); };
  
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockUnit, setRestockUnit] = useState('pieces');

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = filterCat === 'all' || i.category === filterCat;
      return matchSearch && matchCat;
    });
  }, [items, search, filterCat]);

  const grouped = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    for (const item of filtered) {
      (groups[item.category] = groups[item.category] || []).push(item);
    }
    return groups;
  }, [filtered]);

  const isLowStock = (item: InventoryItem) => item.min_threshold > 0 && item.quantity <= item.min_threshold;
  const isExpiringSoon = (item: InventoryItem) => {
    if (!item.expiry_date) return false;
    return isBefore(new Date(item.expiry_date), addDays(new Date(), 3));
  };

  const handleScanToPantry = (item: {
    name: string; quantity: number; unit: string; category: string;
    expiry_date?: string | null; storage_location?: string; min_threshold?: number;
  }) => {
    // Check for existing item with same name and location
    const normalizedName = item.name.toLowerCase().trim();
    const existing = items.find(i =>
      i.name.toLowerCase().trim() === normalizedName &&
      i.storage_location === (item.storage_location || 'pantry')
    );
    if (existing) {
      updateItem.mutate({
        id: existing.id,
        quantity: existing.quantity + item.quantity,
        _logDetails: `Scanned & added ${item.quantity} more (${existing.quantity} → ${existing.quantity + item.quantity} ${existing.unit})`,
        name: existing.name,
      });
      toast.success(`Updated ${existing.name} quantity via scan`);
    } else {
      addItem.mutate(item);
      toast.success(`${item.name} scanned & added to pantry!`);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-display font-bold flex-shrink-0">Pantry</h1>
        <div className="flex gap-1.5">
          <Button size="icon" variant="outline" className="h-8 w-8 relative" onClick={openScanner} title={isPro ? 'Scan product' : 'Pro feature — upgrade to scan'}>
            <Camera className="w-4 h-4" />
            {!isPro && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-foreground/90 flex items-center justify-center ring-2 ring-background">
                <Lock className="w-2 h-2 text-background" />
              </span>
            )}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8"><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Pantry Item</DialogTitle></DialogHeader>
              <ItemForm submitLabel="Add to Pantry" onSubmit={item => {
                const normalizedName = item.name.toLowerCase().trim();
                const existing = items.find(i =>
                  i.name.toLowerCase().trim() === normalizedName &&
                  i.storage_location === item.storage_location
                );
                if (existing) {
                  updateItem.mutate({
                    id: existing.id,
                    quantity: existing.quantity + item.quantity,
                    _logDetails: `Added ${item.quantity} more (${existing.quantity} → ${existing.quantity + item.quantity} ${existing.unit})`,
                    name: existing.name,
                  });
                  toast.success(`Updated ${existing.name} quantity`);
                } else {
                  addItem.mutate(item);
                }
                setAddOpen(false);
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading pantry...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground">Your pantry is empty</h3>
          <p className="text-muted-foreground text-sm mt-1">Start adding items to track your inventory</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1"
            onClick={openScanner}
          >
            <Camera className="w-4 h-4" /> Scan a product
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No items match your search</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{cat}</h3>
            {catItems.map(item => (
              <Card
                key={item.id}
                className={`border-border/50 shadow-none hover:shadow-sm transition-shadow cursor-pointer ${isLowStock(item) ? 'border-l-[3px] border-l-warning' : ''} ${isExpiringSoon(item) ? 'border-l-[3px] border-l-destructive' : ''}`}
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        {isLowStock(item) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warning/15 text-warning text-[10px] font-semibold leading-none flex-shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            Low
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatQty(item.quantity)} {item.unit}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground capitalize">{item.storage_location}</span>
                        {item.expiry_date && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className={`text-xs ${isExpiringSoon(item) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              Exp {format(new Date(item.expiry_date), 'MMM d')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {expandedId === item.id && (
                    <QuickActions
                      item={item}
                      onUse={(amount, action) => {
                        quickUse.mutate({ item, amount, action });
                        if (amount >= item.quantity) setExpandedId(null);
                      }}
                      onRestock={() => {
                        setRestockTarget(item);
                        setRestockQty(String(item.min_threshold || 1));
                        setRestockUnit(item.unit || 'pieces');
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}

      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          {editItem && (
            <ItemForm
              initial={editItem}
              submitLabel="Save Changes"
              onSubmit={updates => { updateItem.mutate({ id: editItem.id, ...updates, _logDetails: `Updated ${editItem.name}` }); setEditItem(null); toast.success('Item updated'); }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ProductScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onAddToPantry={handleScanToPantry}
      />



      <Dialog open={!!restockTarget} onOpenChange={open => !open && setRestockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock {restockTarget?.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!restockTarget) return;
              const qty = Number(restockQty);
              if (!qty || qty <= 0) {
                toast.error('Enter a valid quantity');
                return;
              }
              addShoppingItem.mutate({
                name: restockTarget.name,
                quantity: qty,
                unit: restockUnit,
                category: restockTarget.category,
              });
              toast.success(`${restockTarget.name} added to shopping list`);
              setRestockTarget(null);
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Currently {formatQty(restockTarget?.quantity)} {restockTarget?.unit} in {restockTarget?.storage_location}. How much do you want to restock?
            </p>
            <div className="flex gap-3">
              <Input
                type="number"
                placeholder="Amount"
                value={restockQty}
                onChange={e => setRestockQty(e.target.value)}
                min="0.1"
                step="any"
                autoFocus
                required
                className="flex-1"
              />
              <Select value={restockUnit} onValueChange={setRestockUnit}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent side="bottom" position="popper">
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full gap-2">
              <ShoppingCart className="w-4 h-4" /> Add to Shopping List
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from pantry?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>
              {deleteTarget && (
                <> ({formatQty(deleteTarget.quantity)} {deleteTarget.unit})</>
              )}{' '}
              from your pantry? This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteItem.mutate({ id: deleteTarget.id, name: deleteTarget.name });
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
