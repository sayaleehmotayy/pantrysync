import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface VoiceAction {
  type: 'add_inventory' | 'remove_inventory' | 'update_quantity' | 'add_shopping' | 'remove_shopping' | 'clear_shopping';
  name: string;
  quantity: number;
  unit: string;
  storage_location: string;
  category: string;
}

export default function VoiceCommandBar() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const { household } = useHousehold();
  const { user } = useAuth();
  const { data: inventory = [] } = useInventory();
  const { data: shopping = [] } = useShoppingList();
  const qc = useQueryClient();

  const executeActions = useCallback(async (actions: VoiceAction[]) => {
    if (!household || !user) return;

    for (const action of actions) {
      switch (action.type) {
        case 'add_inventory': {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('id, quantity')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (existing) {
            await supabase.from('inventory_items').update({
              quantity: existing.quantity + action.quantity,
            }).eq('id', existing.id);
            toast.success(`Updated ${action.name}: +${action.quantity} ${action.unit}`);
          } else {
            await supabase.from('inventory_items').insert({
              household_id: household.id,
              name: action.name,
              quantity: action.quantity,
              unit: action.unit,
              category: action.category,
              storage_location: action.storage_location,
              added_by: user.id,
            });
            toast.success(`Added ${action.quantity} ${action.unit} of ${action.name} to ${action.storage_location}`);
          }
          break;
        }

        case 'remove_inventory': {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('id, quantity')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (existing) {
            if (existing.quantity <= action.quantity) {
              await supabase.from('inventory_items').delete().eq('id', existing.id);
              toast.success(`Removed ${action.name} from pantry`);
            } else {
              await supabase.from('inventory_items').update({
                quantity: existing.quantity - action.quantity,
              }).eq('id', existing.id);
              toast.success(`Reduced ${action.name} by ${action.quantity}`);
            }
          } else {
            toast.info(`${action.name} not found in pantry`);
          }
          break;
        }

        case 'update_quantity': {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('id, quantity')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (existing) {
            const newQty = Math.max(0, existing.quantity - action.quantity);
            if (newQty <= 0) {
              await supabase.from('inventory_items').delete().eq('id', existing.id);
              toast.success(`Used all ${action.name}`);
            } else {
              await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', existing.id);
              toast.success(`Used ${action.quantity} ${action.unit} of ${action.name}, ${newQty} remaining`);
            }
          } else {
            toast.info(`${action.name} not found in pantry`);
          }
          break;
        }

        case 'add_shopping': {
          await supabase.from('shopping_list_items').insert({
            household_id: household.id,
            name: action.name,
            quantity: action.quantity,
            unit: action.unit,
            category: action.category,
            requested_by: user.id,
          });
          toast.success(`Added ${action.name} to shopping list`);
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }

        case 'remove_shopping': {
          const { data: match } = await supabase
            .from('shopping_list_items')
            .select('id')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (match) {
            await supabase.from('shopping_list_items').delete().eq('id', match.id);
            toast.success(`Removed ${action.name} from shopping list`);
          } else {
            toast.info(`${action.name} not found in shopping list`);
          }
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }

        case 'clear_shopping': {
          const { data: allItems } = await supabase
            .from('shopping_list_items')
            .select('id')
            .eq('household_id', household.id);

          if (allItems && allItems.length > 0) {
            for (const item of allItems) {
              await supabase.from('shopping_list_items').delete().eq('id', item.id);
            }
            toast.success(`Cleared ${allItems.length} items from shopping list`);
          } else {
            toast.info('Shopping list is already empty');
          }
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['inventory'] });
  }, [household, user, qc]);

  const processCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('voice-command', {
        body: {
          text,
          inventoryItems: inventory.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            storage_location: i.storage_location,
          })),
          shoppingItems: shopping.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            status: i.status,
          })),
        },
      });

      if (error) throw error;

      const actions: VoiceAction[] = data?.actions || [];
      if (actions.length === 0) {
        toast.info("Couldn't understand that command. Try something like 'I bought 2 boxes of milk'");
        return;
      }

      await executeActions(actions);
    } catch (e: any) {
      console.error('Voice command error:', e);
      toast.error(e.message || 'Failed to process command');
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  }, [inventory, shopping, executeActions]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let fullTranscript = '';

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results);
      fullTranscript = results
        .map((r: any) => r[0].transcript)
        .join(' ');
      setTranscript(fullTranscript);

      // Reset silence timer on each result - wait for user to finish speaking
      if (silenceTimer) clearTimeout(silenceTimer);
      
      // Check if the latest result is final
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        // Give 2s of silence after final result before processing
        silenceTimer = setTimeout(() => {
          recognition.stop();
          processCommand(fullTranscript);
          setIsListening(false);
        }, 2000);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted') {
        toast.error('Could not recognize speech. Please try again.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, processCommand]);

  return (
    <div className="relative group">
      {/* Ambient glow behind the bar */}
      <div className={`absolute -inset-1 rounded-3xl transition-all duration-500 blur-xl ${
        isListening
          ? 'bg-primary/20 animate-pulse'
          : isProcessing
          ? 'bg-accent/15 animate-pulse'
          : 'bg-primary/5 group-hover:bg-primary/10'
      }`} />

      <div className={`relative flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all duration-500 backdrop-blur-md ${
        isListening
          ? 'border-primary/40 bg-primary/5 shadow-lg shadow-primary/15'
          : isProcessing
          ? 'border-accent/40 bg-accent/5 shadow-lg shadow-accent/10'
          : 'border-primary/15 bg-gradient-to-r from-card/80 to-primary/[0.03] shadow-md hover:shadow-lg hover:border-primary/25'
      }`}>
        {/* Animated mic button */}
        <div className="relative shrink-0">
          {/* Orbiting dots when idle */}
          {!isListening && !isProcessing && (
            <>
              <div className="absolute -inset-2 rounded-full">
                <div className="absolute w-1.5 h-1.5 rounded-full bg-primary/40 animate-[spin_4s_linear_infinite]" style={{ top: '0', left: '50%', transformOrigin: '0 16px' }} />
                <div className="absolute w-1 h-1 rounded-full bg-accent/40 animate-[spin_6s_linear_infinite_reverse]" style={{ top: '50%', right: '0', transformOrigin: '-12px 0' }} />
              </div>
            </>
          )}

          {/* Pulsing rings when listening */}
          {isListening && (
            <>
              <div className="absolute -inset-3 rounded-full border border-primary/30 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="absolute -inset-5 rounded-full border border-primary/15 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
              <div className="absolute -inset-7 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.6s' }} />
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={`relative h-11 w-11 rounded-xl shrink-0 transition-all duration-500 z-10 ${
              isListening
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110'
                : isProcessing
                ? 'bg-accent text-accent-foreground shadow-md shadow-accent/20'
                : 'bg-gradient-to-br from-primary/15 to-primary/5 text-primary hover:from-primary/25 hover:to-primary/10 hover:scale-105'
            }`}
            onClick={toggleListening}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isListening ? (
              <MicOff className="w-5 h-5 animate-pulse" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="flex-1 min-w-0">
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-muted-foreground truncate">AI is thinking...</p>
            </div>
          ) : isListening ? (
            <div>
              <p className="text-sm font-medium text-primary truncate">
                {transcript || 'Listening...'}
              </p>
              {!transcript && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Try "I bought 2 kg of rice" or "remove milk"
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-foreground/80 truncate flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary/60" />
                AI Voice Assistant
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Tap to add, remove, or manage items
              </p>
            </div>
          )}
        </div>

        {/* Sparkle indicator */}
        {!isListening && !isProcessing && (
          <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary/40 animate-pulse" style={{ animationDuration: '3s' }} />
          </div>
        )}
      </div>
    </div>
  );
}
