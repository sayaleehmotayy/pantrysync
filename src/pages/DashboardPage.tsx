import React from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { useShoppingList, ShoppingItem } from '@/hooks/useShoppingList';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingCart, AlertTriangle, Clock, Activity,
  ChevronRight, Plus, ChefHat, MessageCircle, Sparkles, Check
} from 'lucide-react';
import { formatDistanceToNow, isBefore, addDays, format } from 'date-fns';

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
  const { data: shopping = [], updateItem } = useShoppingList();
  const { data: activities = [], getMemberName } = useActivityLog(10);
  const { household } = useHousehold();
  const { user } = useAuth();
  const navigate = useNavigate();

  const lowStock = inventory.filter(i => i.min_threshold > 0 && i.quantity <= i.min_threshold);
  const expiringSoon = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expiring');
  const expired = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expired');
  const pendingShopping = shopping.filter(i => i.status === 'pending');

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-5 border border-primary/10">
        <div className="relative z-10">
          <p className="text-sm text-muted-foreground font-medium">{greeting()} 👋</p>
          <h1 className="text-2xl font-display font-bold mt-0.5">{household?.name || 'PantrySync'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inventory.length} items in pantry · {pendingShopping.length} to buy
          </p>
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-primary/10 blur-2xl" />
        <div className="absolute -right-2 -bottom-4 w-20 h-20 rounded-full bg-accent/10 blur-xl" />
      </div>

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

      {/* Shopping preview */}
      {pendingShopping.length > 0 && (
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
            <div className="space-y-2">
              {pendingShopping.slice(0, 4).map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateItem.mutate({ id: item.id, status: 'bought', bought_quantity: item.quantity });
                      }}
                      className="w-4 h-4 rounded border border-border flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors active:scale-90"
                    >
                      {item.status === 'bought' && <Check className="w-3 h-3 text-primary" />}
                    </button>
                    <span>{item.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Activity className="w-4 h-4" /> Recent Activity
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/activity')}>
              View all <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 6).map(a => (
                <div key={a.id} className="flex items-start gap-2.5 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{getMemberName(a.user_id)}</span>{' '}
                      <span className="text-muted-foreground">{a.action}</span>{' '}
                      {a.item_name && <span className="font-medium">{a.item_name}</span>}
                    </p>
                    {a.details && <p className="text-xs text-muted-foreground">{a.details}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </p>
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
