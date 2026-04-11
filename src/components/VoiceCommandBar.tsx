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
  }, [inventory, executeActions]);

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
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results);
      const transcript = results
        .map((r: any) => r[0].transcript)
        .join('');
      setTranscript(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        processCommand(transcript);
        setIsListening(false);
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
    <div className="relative">
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-300 ${
        isListening 
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
          : isProcessing
          ? 'border-accent bg-accent/5'
          : 'border-border/50 bg-card/50 backdrop-blur-sm'
      }`}>
        <Button
          variant="ghost"
          size="icon"
          className={`h-10 w-10 rounded-xl shrink-0 transition-all duration-300 ${
            isListening
              ? 'bg-primary text-primary-foreground animate-pulse shadow-md'
              : isProcessing
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted hover:bg-primary/10 hover:text-primary'
          }`}
          onClick={toggleListening}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isListening ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent animate-pulse shrink-0" />
              <p className="text-sm text-muted-foreground truncate">Processing your command...</p>
            </div>
          ) : isListening ? (
            <p className="text-sm truncate">
              {transcript || <span className="text-muted-foreground italic">Listening... say something like "I bought 2 kg of rice"</span>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground truncate">
              Tap the mic to add items by voice
            </p>
          )}
        </div>
      </div>

      {/* Listening pulse rings */}
      {isListening && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none">
          <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        </div>
      )}
    </div>
  );
}
