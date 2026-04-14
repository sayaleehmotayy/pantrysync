import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, Store, ChevronDown, ChevronUp, ShoppingCart, DollarSign } from 'lucide-react';
import { getCurrencyInfo, formatCurrency } from '@/lib/currency';

interface TripItem {
  id: string;
  item_name: string;
  quantity_bought: number;
  unit: string;
  category: string;
  unit_price: number | null;
  total_price: number;
}

interface Trip {
  id: string;
  store_name: string | null;
  budget: number | null;
  total_spent: number;
  currency: string;
  items_count: number;
  started_at: string;
  finished_at: string;
}

export default function ShoppingHistoryPage() {
  const { household } = useHousehold();
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['shopping-trips', household?.id],
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from('shopping_trips')
        .select('*')
        .eq('household_id', household.id)
        .order('finished_at', { ascending: false });
      if (error) throw error;
      return data as Trip[];
    },
    enabled: !!household,
  });

  const { data: tripItems = [] } = useQuery({
    queryKey: ['shopping-trip-items', expandedTrip],
    queryFn: async () => {
      if (!expandedTrip) return [];
      const { data, error } = await supabase
        .from('shopping_trip_items')
        .select('*')
        .eq('trip_id', expandedTrip)
        .order('created_at');
      if (error) throw error;
      return data as TripItem[];
    },
    enabled: !!expandedTrip,
  });

  const toggleTrip = (id: string) => {
    setExpandedTrip(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-display font-bold">Shopping History</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <History className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No shopping trips yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Your shopping history will appear here after you finish a trip
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map(trip => {
            const curr = getCurrencyInfo(trip.currency);
            const fmt = (n: number) => formatCurrency(n, curr);
            const isExpanded = expandedTrip === trip.id;

            return (
              <Card
                key={trip.id}
                className="border-border/50 shadow-none overflow-hidden"
              >
                <CardContent className="p-0">
                  <button
                    onClick={() => toggleTrip(trip.id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        {trip.store_name ? (
                          <span className="font-medium text-sm flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-muted-foreground" />
                            {trip.store_name}
                          </span>
                        ) : (
                          <span className="font-medium text-sm text-muted-foreground">Shopping trip</span>
                        )}
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {trip.items_count} items
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{format(new Date(trip.finished_at), 'MMM d, yyyy · h:mm a')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-sm">{fmt(trip.total_spent)}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/10">
                      {/* Trip summary */}
                      <div className="flex gap-4 text-xs">
                        {trip.budget && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <DollarSign className="w-3 h-3" />
                            Budget: {fmt(trip.budget)}
                            {trip.total_spent <= trip.budget ? (
                              <Badge variant="outline" className="text-[10px] h-4 ml-1 text-primary">
                                {fmt(trip.budget - trip.total_spent)} saved
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] h-4 ml-1">
                                {fmt(trip.total_spent - trip.budget)} over
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-1.5">
                        {tripItems.map(item => (
                          <div key={item.id} className="flex items-center justify-between text-sm py-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{item.item_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.quantity_bought} {item.unit} · {item.category}
                              </p>
                            </div>
                            <span className="font-medium text-sm shrink-0 ml-2">{fmt(item.total_price)}</span>
                          </div>
                        ))}
                        {tripItems.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">Loading items...</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
