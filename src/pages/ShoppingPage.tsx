import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useShoppingList, ShoppingItem } from '@/hooks/useShoppingList';
import { useInventory } from '@/hooks/useInventory';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ShoppingCart, Check, AlertTriangle, X, Trash2, Camera, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ProductScanner from '@/components/ProductScanner';
import ShoppingMode from '@/components/ShoppingMode';
import { useUserCurrency } from '@/hooks/useUserCurrency';
import { guessCategory } from '@/lib/categorize';

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Other'];
const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp'];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  bought: { label: 'Bought', variant: 'default' },
  partial: { label: 'Partial', variant: 'outline' },
  not_found: { label: 'Not Found', variant: 'destructive' },
};

export default function ShoppingPage() {
  const { data: items = [], isLoading, addItem, updateItem, deleteItem } = useShoppingList();
  const { addItem: addPantryItem } = useInventory();
  const { household } = useHousehold();
  const [addOpen, setAddOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(() => {
    try { return !!sessionStorage.getItem('pantrysync_shopping_session'); } catch { return false; }
  });
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pieces');
  const [category, setCategory] = useState('Other');
  const [partialId, setPartialId] = useState<string | null>(null);
  const [partialQty, setPartialQty] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const userCurrency = useUserCurrency();
  const [deleteTarget, setDeleteTarget] = useState<ShoppingItem | null>(null);

  const pendingItems = useMemo(() => items.filter(i => i.status === 'pending' || i.status === 'not_found'), [items]);
  const completedItems = useMemo(() => items.filter(i => i.status === 'bought' || i.status === 'partial'), [items]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    // Auto-categorize when user kept the default "Other"
    const finalCategory = category === 'Other' ? guessCategory(name, 'Other') : category;
    addItem.mutate({ name, quantity: Number(quantity), unit, category: finalCategory });
    setName(''); setQuantity('1'); setUnit('pieces'); setCategory('Other');
    setAddOpen(false);
  };

  const handlePartialBought = (item: ShoppingItem) => {
    const qty = Number(partialQty);
    if (qty > 0) {
      updateItem.mutate({ id: item.id, status: 'partial', bought_quantity: qty });
    }
    setPartialId(null);
    setPartialQty('');
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleScanToPantry = (item: {
    name: string; quantity: number; unit: string; category: string;
    expiry_date?: string | null; storage_location?: string; min_threshold?: number;
  }) => {
    addPantryItem.mutate(item);
    toast.success(`${item.name} added to pantry via scan!`);
  };

  const handleShoppingModeBought = (_id: string, _price: number, _quantityFound?: number) => {
    // No-op during the trip. ShoppingMode tracks purchases locally and
    // commits them to pantry + shopping list on "Finish Shopping".
  };

  // Shopping Mode
  if (shoppingMode) {
    return (
      <div className="animate-fade-in">
        <ShoppingMode
          items={items}
          onMarkBought={handleShoppingModeBought}
          onExit={() => setShoppingMode(false)}
          currency={userCurrency}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Shopping List</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setScannerOpen(true)}
            className="gap-1"
          >
            <Camera className="w-4 h-4" /> Scan
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Shopping Item</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <Input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} required />
                <div className="flex gap-3">
                  <Input type="number" placeholder="Qty" value={quantity} onChange={e => setQuantity(e.target.value)} required min="0.1" step="any" className="flex-1" />
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="submit" className="w-full">Add to List</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Shopping Mode CTA */}
      {pendingItems.length > 0 && (
        <Card
          className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 cursor-pointer hover:border-primary/50 active:scale-[0.99] transition-all"
          onClick={() => setShoppingMode(true)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-sm">Start Shopping</p>
              <p className="text-xs text-muted-foreground">Set a budget and track prices as you shop</p>
            </div>
            <Badge variant="default" className="shrink-0">{pendingItems.length} items</Badge>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ShoppingCart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">Nothing to buy</h3>
          <p className="text-muted-foreground text-sm mt-1">Your shopping list is empty</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1"
            onClick={() => setScannerOpen(true)}
          >
            <Camera className="w-4 h-4" /> Scan a product to pantry
          </Button>
        </div>
      ) : (
        <>
          {pendingItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">To Buy ({pendingItems.length})</h3>
              {pendingItems.map(item => (
                <Card key={item.id} className="border-border/50 shadow-none">
                  <CardContent className="p-3">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleExpand(item.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm ${expandedId === item.id ? '' : 'truncate'}`}>{item.name}</p>
                          <Badge variant={STATUS_CONFIG[item.status].variant} className="text-[10px] h-5 shrink-0">
                            {STATUS_CONFIG[item.status].label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · {item.category}</p>
                      </div>
                      <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => updateItem.mutate({ id: item.id, status: 'bought', bought_quantity: item.quantity })}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPartialId(item.id); setPartialQty(''); }}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateItem.mutate({ id: item.id, status: 'not_found' })}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Item:</span> {item.name}</p>
                        <p><span className="font-medium text-foreground">Quantity:</span> {item.quantity} {item.unit}</p>
                        <p><span className="font-medium text-foreground">Category:</span> {item.category}</p>
                        <p><span className="font-medium text-foreground">Added:</span> {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</p>
                      </div>
                    )}
                    {partialId === item.id && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="number"
                          placeholder="Bought qty"
                          value={partialQty}
                          onChange={e => setPartialQty(e.target.value)}
                          className="flex-1"
                          min="0.1"
                          max={String(item.quantity)}
                          step="any"
                        />
                        <Button size="sm" onClick={() => handlePartialBought(item)}>Confirm</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {completedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bought ({completedItems.length})</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setScannerOpen(true)}
                >
                  <Camera className="w-3.5 h-3.5" /> Scan to Pantry
                </Button>
              </div>
              {completedItems.map(item => (
                <Card key={item.id} className="border-border/50 shadow-none opacity-70">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm line-through truncate">{item.name}</p>
                        <Badge variant={STATUS_CONFIG[item.status].variant} className="text-[10px] h-5">
                          {item.status === 'partial' ? `${item.bought_quantity}/${item.quantity} ${item.unit}` : STATUS_CONFIG[item.status].label}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(item)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ProductScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onAddToPantry={handleScanToPantry}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from shopping list?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>
              {deleteTarget && (
                <> ({deleteTarget.quantity} {deleteTarget.unit})</>
              )}{' '}
              from your shopping list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteItem.mutate(deleteTarget.id);
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
