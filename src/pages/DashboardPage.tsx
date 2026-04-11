import React, { useState } from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import VoiceCommandBar from '@/components/VoiceCommandBar';
import { useShoppingList, ShoppingItem } from '@/hooks/useShoppingList';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { STRIPE_CONFIG, PRO_FEATURES } from '@/config/subscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingCart, AlertTriangle, Clock,
  ChevronRight, Plus, ChefHat, MessageCircle, Check, Trash2, Sparkles
} from 'lucide-react';
import { formatDistanceToNow, isBefore, addDays } from 'date-fns';

const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp'];

function getExpiryStatus(date: string | null): 'safe' | 'expiring' | 'expired' | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  if (isBefore(d, now)) return 'expired';
  if (isBefore(d, addDays(now, 3))) return 'expiring';
  return 'safe';
}

export default function DashboardPage() {
  const { data: inventory = [] } = useInventory();
  const { data: shopping = [], updateItem, deleteItem } = useShoppingList();
  const { household } = useHousehold();
  const { user, subscription } = useAuth();
  const navigate = useNavigate();

  const [partialId, setPartialId] = useState<string | null>(null);
  const [partialQty, setPartialQty] = useState('');
  const [partialUnit, setPartialUnit] = useState('pieces');

  const recentlyBought = shopping
    .filter(i => i.status === 'bought')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const lowStock = inventory.filter(i => i.min_threshold > 0 && i.quantity <= i.min_threshold);
  const expiringSoon = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expiring');
  const expired = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expired');
  const pendingShopping = shopping.filter(i => i.status === 'pending' || i.status === 'not_found');

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handlePartialBought = (item: ShoppingItem) => {
    const qty = Number(partialQty);
    if (qty > 0 && qty < item.quantity) {
      updateItem.mutate({ id: item.id, status: 'partial', bought_quantity: qty });
    }
    setPartialId(null);
    setPartialQty('');
    setPartialUnit('pieces');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-5 border border-primary/10">
        <div className="relative z-10">
          <p className="text-sm text-muted-foreground font-medium">{greeting()} 👋</p>
          <h1 className="text-2xl font-display font-bold mt-0.5">
            {user?.user_metadata?.display_name?.split(' ')[0] || household?.name || 'PantrySync'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inventory.length} items in pantry · {pendingShopping.length} to buy
          </p>
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-primary/10 blur-2xl" />
        <div className="absolute -right-2 -bottom-4 w-20 h-20 rounded-full bg-accent/10 blur-xl" />
      </div>

      <VoiceCommandBar />

      {/* Quick actions */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Button size="sm" onClick={() => navigate('/pantry')} className="rounded-full gap-1.5 flex-shrink-0 shadow-sm transition-all duration-200 active:scale-95">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/shopping')} className="rounded-full gap-1.5 flex-shrink-0 transition-all duration-200 active:scale-95">
          <ShoppingCart className="w-3.5 h-3.5" /> Shopping
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/recipes')} className="rounded-full gap-1.5 flex-shrink-0 transition-all duration-200 active:scale-95">
          <ChefHat className="w-3.5 h-3.5" /> Recipes
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/chat')} className="rounded-full gap-1.5 flex-shrink-0 transition-all duration-200 active:scale-95">
          <MessageCircle className="w-3.5 h-3.5" /> Chat
        </Button>
      </div>

      {/* Pro Upgrade Card */}
      {!subscription.subscribed && !subscription.loading && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-sm">Upgrade to PantrySync Pro</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Unlock AI assistant, recipes, group chat, discount scanner & more
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRO_FEATURES.slice(0, 5).map(f => (
                    <Badge key={f.key} variant="secondary" className="text-[10px]">{f.label}</Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={async () => {
                    const { data } = await supabase.functions.invoke('create-checkout');
                    if (data?.url) window.open(data.url, '_blank');
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Upgrade — {STRIPE_CONFIG.monthlyPrice}/mo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50 cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98]" onClick={() => navigate('/pantry')}>
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <Package className="w-4.5 h-4.5 text-primary" />
            </div>
            <p className="text-2xl font-display font-bold">{inventory.length}</p>
            <p className="text-xs text-muted-foreground">Pantry Items</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98]" onClick={() => navigate('/shopping')}>
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center mb-2">
              <ShoppingCart className="w-4.5 h-4.5 text-info" />
            </div>
            <p className="text-2xl font-display font-bold">{pendingShopping.length}</p>
            <p className="text-xs text-muted-foreground">To Buy</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98]" onClick={() => navigate('/expiry')}>
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center mb-2">
              <Clock className="w-4.5 h-4.5 text-warning" />
            </div>
            <p className="text-2xl font-display font-bold">{expiringSoon.length}</p>
            <p className="text-xs text-muted-foreground">Expiring Soon</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98]" onClick={() => navigate('/expiry')}>
          <CardContent className="p-4">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="w-4.5 h-4.5 text-destructive" />
            </div>
            <p className="text-2xl font-display font-bold">{lowStock.length + expired.length}</p>
            <p className="text-xs text-muted-foreground">Needs Attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <Card className="border-warning/20 bg-warning/5 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Low Stock
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5">
              {lowStock.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <span>{item.name}</span>
                  </div>
                  <span className="text-warning font-semibold text-xs">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring soon */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <Card className="border-destructive/20 bg-destructive/5 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Clock className="w-4 h-4 text-destructive" /> Expiry Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5">
              {expired.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                    <span>{item.name}</span>
                  </div>
                  <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                </div>
              ))}
              {expiringSoon.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <span>{item.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-warning text-warning">
                    {item.expiry_date && formatDistanceToNow(new Date(item.expiry_date), { addSuffix: true })}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shopping List - full interactive */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-info" /> Shopping List
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/shopping')}>
              View all <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {pendingShopping.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nothing to buy right now</p>
          ) : (
            <div className="space-y-2">
              {pendingShopping.slice(0, 8).map(item => (
                <div key={item.id}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        onClick={() => updateItem.mutate({ id: item.id, status: 'bought', bought_quantity: item.quantity })}
                        className="text-sm cursor-pointer hover:line-through hover:text-muted-foreground transition-all truncate text-left"
                        title="Click to mark as bought"
                      >
                        {item.name}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground mr-1">{item.quantity} {item.unit}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Partial buy"
                        onClick={() => { setPartialId(partialId === item.id ? null : item.id); setPartialQty(''); setPartialUnit(item.unit); }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="Remove"
                        onClick={() => deleteItem.mutate(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {partialId === item.id && (
                    <div className="flex gap-2 mt-1.5 ml-0">
                      <Input
                        type="number"
                        placeholder="Qty bought"
                        value={partialQty}
                        onChange={e => setPartialQty(e.target.value)}
                        className="flex-1 h-8 text-sm"
                        min="0.1"
                        max={String(item.quantity)}
                        step="any"
                      />
                      <Select value={partialUnit} onValueChange={setPartialUnit}>
                        <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 text-xs" onClick={() => handlePartialBought(item)}>OK</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently bought */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" /> Recently Bought
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/shopping')}>
              View all <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {recentlyBought.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recently bought items</p>
          ) : (
            <div className="space-y-2.5">
              {recentlyBought.slice(0, 6).map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{item.bought_quantity || item.quantity} {item.unit}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
