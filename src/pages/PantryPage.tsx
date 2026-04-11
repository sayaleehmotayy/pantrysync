import React, { useState, useMemo } from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Other'];
const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp'];

function ItemForm({ onSubmit, initial, submitLabel }: {
  onSubmit: (item: { name: string; quantity: number; unit: string; category: string }) => void;
  initial?: Partial<InventoryItem>;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [quantity, setQuantity] = useState(String(initial?.quantity || ''));
  const [unit, setUnit] = useState(initial?.unit || 'pieces');
  const [category, setCategory] = useState(initial?.category || 'Other');

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, quantity: Number(quantity), unit, category }); }} className="space-y-4">
      <Input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} required />
      <div className="flex gap-3">
        <Input type="number" placeholder="Qty" value={quantity} onChange={e => setQuantity(e.target.value)} required min="0" step="any" className="flex-1" />
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );
}

export default function PantryPage() {
  const { data: items = [], isLoading, addItem, updateItem, deleteItem } = useInventory();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Pantry</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Pantry Item</DialogTitle></DialogHeader>
            <ItemForm submitLabel="Add to Pantry" onSubmit={item => { addItem.mutate(item); setAddOpen(false); }} />
          </DialogContent>
        </Dialog>
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
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No items match your search</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{cat}</h3>
            {catItems.map(item => (
              <Card key={item.id} className="border-border/50 shadow-none hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} {item.unit} · Updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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
              onSubmit={updates => { updateItem.mutate({ id: editItem.id, ...updates }); setEditItem(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
