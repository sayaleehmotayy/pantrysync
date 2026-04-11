import React from 'react';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingCart, AlertTriangle, Clock, Activity,
  ChevronRight, Plus, Thermometer
} from 'lucide-react';
import { formatDistanceToNow, differenceInDays, isAfter, isBefore, addDays } from 'date-fns';

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
  const { data: shopping = [] } = useShoppingList();
  const { data: activities = [], getMemberName } = useActivityLog(10);
  const { household } = useHousehold();
  const navigate = useNavigate();

  const lowStock = inventory.filter(i => i.min_threshold > 0 && i.quantity <= i.min_threshold);
  const expiringSoon = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expiring');
  const expired = inventory.filter(i => getExpiryStatus(i.expiry_date) === 'expired');
  const pendingShopping = shopping.filter(i => i.status === 'pending');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{household?.name}</p>
        </div>
        <Button size="sm" onClick={() => navigate('/pantry')}>
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow" onClick={() => navigate('/pantry')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold">{inventory.length}</p>
            <p className="text-xs text-muted-foreground">Pantry Items</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow" onClick={() => navigate('/shopping')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-info" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold">{pendingShopping.length}</p>
            <p className="text-xs text-muted-foreground">To Buy</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow" onClick={() => navigate('/expiry')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-warning" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold">{expiringSoon.length}</p>
            <p className="text-xs text-muted-foreground">Expiring Soon</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
            </div>
            <p className="text-2xl font-display font-bold">{lowStock.length + expired.length}</p>
            <p className="text-xs text-muted-foreground">Needs Attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Low Stock
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {lowStock.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <span className="text-warning font-medium">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring soon */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Clock className="w-4 h-4 text-destructive" /> Expiry Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {expired.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                </div>
              ))}
              {expiringSoon.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <Badge variant="outline" className="text-[10px] border-warning text-warning">
                    {item.expiry_date && formatDistanceToNow(new Date(item.expiry_date), { addSuffix: true })}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      <Card className="border-border/50">
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
                <div key={a.id} className="flex items-start gap-2 text-sm">
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
