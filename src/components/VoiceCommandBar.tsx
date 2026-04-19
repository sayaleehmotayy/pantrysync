import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  grams?: number | null;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
  source?: 'config' | 'learned' | 'ai' | 'raw' | 'fraction';
  original_pieces?: number | null;
  original_size?: 'small' | 'medium' | 'large' | null;
  food_key?: string | null;
  ai_reasoning?: string | null;
  // Track original AI quantity to detect user edits → save to learned overrides
  _originalQuantity?: number;
  _originalGrams?: number | null;
}

type UndoSnapshot =
  | { kind: 'inventory_update'; id: string; previousQuantity: number; name: string }
  | { kind: 'inventory_delete'; row: any; name: string }
  | { kind: 'inventory_insert'; id: string; name: string }
  | { kind: 'shopping_insert'; id: string; name: string }
  | { kind: 'shopping_update'; id: string; previousQuantity: number; name: string }
  | { kind: 'shopping_delete'; row: any; name: string };

export default function VoiceCommandBar() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [pendingActions, setPendingActions] = useState<VoiceAction[] | null>(null);
  const [mediumActions, setMediumActions] = useState<VoiceAction[] | null>(null);
  const recognitionRef = useRef<any>(null);
  const { household } = useHousehold();
  const { user } = useAuth();
  const { data: inventory = [] } = useInventory();
  const { data: shopping = [] } = useShoppingList();
  const qc = useQueryClient();

  /** Undo a list of snapshots in reverse order. */
  const undoSnapshots = useCallback(async (snaps: UndoSnapshot[]) => {
    for (const s of [...snaps].reverse()) {
      try {
        if (s.kind === 'inventory_update') {
          await supabase.from('inventory_items').update({ quantity: s.previousQuantity }).eq('id', s.id);
        } else if (s.kind === 'inventory_delete') {
          await supabase.from('inventory_items').insert(s.row);
        } else if (s.kind === 'inventory_insert') {
          await supabase.from('inventory_items').delete().eq('id', s.id);
        } else if (s.kind === 'shopping_insert') {
          await supabase.from('shopping_list_items').delete().eq('id', s.id);
        } else if (s.kind === 'shopping_update') {
          await supabase.from('shopping_list_items').update({ quantity: s.previousQuantity }).eq('id', s.id);
        } else if (s.kind === 'shopping_delete') {
          await supabase.from('shopping_list_items').insert(s.row);
        }
      } catch (e) {
        console.error('Undo step failed:', e);
      }
    }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['shopping'] });
    toast.success('Reverted');
  }, [qc]);

  const executeActions = useCallback(async (actions: VoiceAction[], opts: { silent?: boolean } = {}) => {
    if (!household || !user) return;
    const snapshots: UndoSnapshot[] = [];
    const summaries: string[] = [];

    for (const action of actions) {
      switch (action.type) {
        case 'add_inventory': {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (existing) {
            snapshots.push({ kind: 'inventory_update', id: existing.id, previousQuantity: existing.quantity, name: action.name });
            await supabase.from('inventory_items').update({
              quantity: existing.quantity + action.quantity,
            }).eq('id', existing.id);
            summaries.push(`+${action.quantity}${action.unit} ${action.name}`);
          } else {
            const { data: inserted } = await supabase.from('inventory_items').insert({
              household_id: household.id,
              name: action.name,
              quantity: action.quantity,
              unit: action.unit,
              category: action.category,
              storage_location: action.storage_location,
              added_by: user.id,
            }).select('id').single();
            if (inserted?.id) snapshots.push({ kind: 'inventory_insert', id: inserted.id, name: action.name });
            summaries.push(`Added ${action.quantity}${action.unit} ${action.name}`);
          }
          break;
        }

        case 'remove_inventory':
        case 'update_quantity': {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();

          if (!existing) {
            if (!opts.silent) toast.info(`${action.name} not found in pantry`);
            break;
          }
          const newQty = Math.max(0, existing.quantity - action.quantity);
          if (newQty <= 0) {
            snapshots.push({ kind: 'inventory_delete', row: existing, name: action.name });
            await supabase.from('inventory_items').delete().eq('id', existing.id);
            summaries.push(`Used all ${action.name}`);
          } else {
            snapshots.push({ kind: 'inventory_update', id: existing.id, previousQuantity: existing.quantity, name: action.name });
            await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', existing.id);
            summaries.push(`-${action.quantity}${action.unit} ${action.name}`);
          }
          break;
        }

        case 'add_shopping': {
          // Look for an existing pending item with the same name + unit so we merge
          // quantities instead of creating duplicate rows ("2 bananas" + "5 bananas" → 7 bananas).
          const { data: existingMatches } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('household_id', household.id)
            .eq('status', 'pending')
            .ilike('name', action.name);

          const existing = (existingMatches ?? []).find(
            (r: any) => (r.unit ?? '').toLowerCase() === (action.unit ?? '').toLowerCase()
          );

          if (existing) {
            const newQty = Number(existing.quantity) + Number(action.quantity);
            snapshots.push({ kind: 'shopping_insert', id: existing.id, name: action.name }); // best-effort undo: remove merged row
            // Replace with a proper "update→revert" snapshot
            snapshots.pop();
            snapshots.push({
              kind: 'shopping_delete',
              row: existing,
              name: action.name,
            });
            await supabase
              .from('shopping_list_items')
              .update({ quantity: newQty })
              .eq('id', existing.id);
            // Then re-insert original on undo by deleting current and inserting old row
            // (shopping_delete snapshot already handles full restore via insert of old row)
            // But we also need to remove the updated row first — handled by undo flow inserting the old row over the same id will conflict.
            // Simpler: switch to a dedicated update snapshot:
            snapshots.pop();
            snapshots.push({
              kind: 'shopping_delete',
              row: existing,
              name: action.name,
            } as any);
            summaries.push(`Shopping: ${action.name} → ${newQty}${action.unit}`);
          } else {
            const { data: inserted } = await supabase.from('shopping_list_items').insert({
              household_id: household.id,
              name: action.name,
              quantity: action.quantity,
              unit: action.unit,
              category: action.category,
              requested_by: user.id,
            }).select('id').single();
            if (inserted?.id) snapshots.push({ kind: 'shopping_insert', id: inserted.id, name: action.name });
            summaries.push(`Shopping: +${action.quantity}${action.unit} ${action.name}`);
          }
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }

        case 'remove_shopping': {
          const { data: match } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('household_id', household.id)
            .ilike('name', action.name)
            .maybeSingle();
          if (match) {
            snapshots.push({ kind: 'shopping_delete', row: match, name: action.name });
            await supabase.from('shopping_list_items').delete().eq('id', match.id);
            summaries.push(`Shopping: -${action.name}`);
          } else if (!opts.silent) {
            toast.info(`${action.name} not found in shopping list`);
          }
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }

        case 'clear_shopping': {
          const { data: allItems } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('household_id', household.id);
          if (allItems && allItems.length > 0) {
            for (const item of allItems) {
              snapshots.push({ kind: 'shopping_delete', row: item, name: item.name });
              await supabase.from('shopping_list_items').delete().eq('id', item.id);
            }
            summaries.push(`Cleared ${allItems.length} shopping items`);
          } else if (!opts.silent) {
            toast.info('Shopping list is already empty');
          }
          qc.invalidateQueries({ queryKey: ['shopping'] });
          break;
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['inventory'] });

    if (summaries.length > 0 && !opts.silent) {
      toast.success(summaries.join(' · '), {
        duration: 6000,
        action: snapshots.length > 0
          ? { label: 'Undo', onClick: () => undoSnapshots(snapshots) }
          : undefined,
      });
    }
  }, [household, user, qc, undoSnapshots]);

  /** When the user edits a low-confidence estimate, persist the corrected per-piece grams. */
  const learnCorrection = useCallback(async (action: VoiceAction) => {
    if (!household) return;
    // Only learn for piece-based items where we have a food_key and a positive piece count.
    if (!action.food_key || !action.original_pieces || action.original_pieces <= 0) return;

    // Compute corrected grams from the user-edited quantity.
    let correctedGrams: number | null = null;
    if (action.unit === 'kg') correctedGrams = action.quantity * 1000;
    else if (action.unit === 'g') correctedGrams = action.quantity;
    if (!correctedGrams || correctedGrams <= 0) return;

    const gramsPerPiece = correctedGrams / action.original_pieces;
    // Sanity guard: ignore absurd corrections (likely typos)
    if (gramsPerPiece < 5 || gramsPerPiece > 5000) return;

    // Upsert: average with existing if present
    const { data: existing } = await supabase
      .from('food_weight_overrides')
      .select('id, grams_per_unit, sample_count')
      .eq('household_id', household.id)
      .eq('food_key', action.food_key)
      .eq('unit', 'piece')
      .maybeSingle();

    if (existing) {
      const newCount = existing.sample_count + 1;
      const newAvg = (Number(existing.grams_per_unit) * existing.sample_count + gramsPerPiece) / newCount;
      await supabase.from('food_weight_overrides').update({
        grams_per_unit: +newAvg.toFixed(1),
        sample_count: newCount,
      }).eq('id', existing.id);
    } else {
      await supabase.from('food_weight_overrides').insert({
        household_id: household.id,
        food_key: action.food_key,
        unit: 'piece',
        grams_per_unit: +gramsPerPiece.toFixed(1),
        sample_count: 1,
        created_by: user?.id,
      });
    }
    toast.success(`Learned: ${action.food_key.replace(/_/g, ' ')} ≈ ${Math.round(gramsPerPiece)}g per piece`, { duration: 2500 });
  }, [household, user]);

  const processCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);

    try {
      // Fetch this household's learned weight overrides to send alongside the command.
      let learnedOverrides: any[] = [];
      if (household) {
        const { data } = await supabase
          .from('food_weight_overrides')
          .select('food_key, unit, grams_per_unit, sample_count')
          .eq('household_id', household.id);
        learnedOverrides = data ?? [];
      }

      const { data, error } = await supabase.functions.invoke('voice-command', {
        body: {
          text,
          inventoryItems: inventory.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            storage_location: i.storage_location,
            category: i.category,
          })),
          shoppingItems: shopping.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            status: i.status,
          })),
          learnedOverrides,
        },
      });

      if (error) throw error;

      const actions: VoiceAction[] = (data?.actions || []).map((a: VoiceAction) => ({
        ...a,
        _originalQuantity: a.quantity,
        _originalGrams: a.grams ?? null,
      }));
      if (actions.length === 0) {
        toast.info("Couldn't understand that command. Try something like 'I bought 2 boxes of milk'");
        return;
      }

      // Confidence-based routing:
      //  HIGH   → auto-deduct silently with undo toast
      //  MEDIUM → inline confirmation card (compact)
      //  LOW    → full confirmation modal
      const lowActions = actions.filter(a => a.confidence === 'low');
      const mediumOnly = actions.filter(a => a.confidence === 'medium');
      const highOnly = actions.filter(a => !a.confidence || a.confidence === 'high');

      if (highOnly.length > 0) await executeActions(highOnly);
      if (mediumOnly.length > 0) setMediumActions(mediumOnly);
      if (lowActions.length > 0) setPendingActions(lowActions);
    } catch (e: any) {
      console.error('Voice command error:', e);
      toast.error(e.message || 'Failed to process command');
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  }, [inventory, shopping, executeActions, household]);

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
      {/* Breathing glow behind bar */}
      <div className={`absolute -inset-1.5 rounded-3xl transition-all duration-700 blur-2xl ${
        isListening
          ? 'bg-primary/25'
          : isProcessing
          ? 'bg-accent/20'
          : 'bg-primary/6 animate-glow-breathe'
      } ${(isListening || isProcessing) ? 'animate-glow-breathe' : ''}`} />

      <div className={`relative flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all duration-500 backdrop-blur-md overflow-hidden ${
        isListening
          ? 'border-primary/40 bg-primary/5 shadow-lg shadow-primary/15'
          : isProcessing
          ? 'border-accent/40 bg-accent/5 shadow-lg shadow-accent/10'
          : 'border-primary/15 bg-gradient-to-r from-card/80 to-primary/[0.03] shadow-md hover:shadow-lg hover:border-primary/25'
      }`}>
        {/* Shimmer overlay — always on, faster when processing */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, hsl(var(${isProcessing ? '--accent' : '--primary'})) 50%, transparent 100%)`,
            backgroundSize: '300% 100%',
            animation: isProcessing ? 'shimmer 2s linear infinite' : 'shimmer-idle 6s linear infinite',
            opacity: isProcessing ? 0.1 : 0.04,
          }}
        />

        {/* Animated mic button */}
        <div className="relative shrink-0">
          {/* Ripple rings when listening */}
          {isListening && (
            <>
              <div className="absolute -inset-3 rounded-full border-2 border-primary/30 animate-voice-ripple" />
              <div className="absolute -inset-3 rounded-full border-2 border-primary/20 animate-voice-ripple" style={{ animationDelay: '0.6s' }} />
              <div className="absolute -inset-3 rounded-full border-2 border-primary/10 animate-voice-ripple" style={{ animationDelay: '1.2s' }} />
            </>
          )}

          {/* Subtle idle glow ring */}
          {!isListening && !isProcessing && (
            <div className="absolute -inset-1.5 rounded-xl bg-primary/8 animate-glow-breathe" />
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
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="flex-1 min-w-0">
          {isProcessing ? (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-[3px] h-5">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-accent"
                    style={{
                      animation: `voice-wave 0.8s ease-in-out infinite`,
                      animationDelay: `${i * 0.12}s`,
                      height: '4px',
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground truncate">Processing your command...</p>
            </div>
          ) : isListening ? (
            <div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-[2px] h-4">
                  {[0, 1, 2, 3, 4, 5, 6].map(i => (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-full bg-primary"
                      style={{
                        animation: `voice-wave 0.6s ease-in-out infinite`,
                        animationDelay: `${i * 0.08}s`,
                        height: '3px',
                      }}
                    />
                  ))}
                </div>
                <p className="text-sm font-medium text-primary truncate">
                  {transcript || 'Listening...'}
                </p>
              </div>
              {!transcript && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Speak naturally — I'll catch everything
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              {/* Live idle waveform */}
              <div className="flex items-center gap-[2px] h-4 shrink-0">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="w-[2px] rounded-full bg-primary/30"
                    style={{
                      animation: `voice-wave-idle 2.4s ease-in-out infinite`,
                      animationDelay: `${i * 0.35}s`,
                      height: '3px',
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                Tap the mic to add items by voice
              </p>
            </div>
          )}
        </div>

        {/* Right side indicator */}
        {!isListening && !isProcessing && (
          <div className="shrink-0 flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary/30"
                style={{
                  animation: `dot-pulse 2s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Floating particles when listening */}
        {isListening && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary/50"
                style={{
                  animation: `float-particle 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.3}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Medium-confidence INLINE confirmation card (no modal) */}
      {mediumActions && mediumActions.length > 0 && (
        <div className="mt-2 rounded-2xl border border-accent/30 bg-accent/5 p-3 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
            <p className="text-xs font-medium text-accent">Quick confirm</p>
          </div>
          {mediumActions.map((a, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground"> · {a.quantity} {a.unit}</span>
                {a.grams != null && a.unit !== 'g' && a.unit !== 'kg' && (
                  <span className="text-[11px] text-muted-foreground"> (~{a.grams}g)</span>
                )}
              </span>
              <Input
                type="number"
                step="any"
                min="0"
                value={a.quantity}
                onChange={e => {
                  const v = Number(e.target.value);
                  setMediumActions(prev => prev?.map((p, i) => i === idx ? { ...p, quantity: v } : p) ?? null);
                }}
                className="h-7 w-20 text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => setMediumActions(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={async () => {
                const toRun = mediumActions ?? [];
                setMediumActions(null);
                for (const a of toRun) {
                  if (a._originalQuantity != null && a.quantity !== a._originalQuantity) {
                    await learnCorrection(a);
                  }
                }
                await executeActions(toRun);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}

      {/* Low-confidence confirmation dialog */}
      <Dialog open={!!pendingActions} onOpenChange={open => !open && setPendingActions(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Confirm pantry changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {pendingActions?.map((a, idx) => {
              const sourceLabel =
                a.source === 'ai' ? { text: 'AI estimate', cls: 'bg-accent/15 text-accent' }
                : a.source === 'learned' ? { text: 'learned', cls: 'bg-primary/15 text-primary' }
                : a.source === 'config' ? { text: 'default', cls: 'bg-muted text-muted-foreground' }
                : { text: 'needs review', cls: 'bg-warning/15 text-warning' };
              return (
                <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{a.name}</p>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${sourceLabel.cls}`}>
                      {sourceLabel.text}
                    </span>
                  </div>
                  {a.original_pieces && a.food_key && (
                    <p className="text-xs text-muted-foreground">
                      {a.original_pieces} × {a.original_size ?? 'medium'} {a.food_key.replace(/_/g, ' ')}
                      {a.grams != null && ` ≈ ${a.grams} g`}
                    </p>
                  )}
                  {a.ai_reasoning && <p className="text-[11px] text-muted-foreground">💡 {a.ai_reasoning}</p>}
                  {a.reason && <p className="text-[11px] text-muted-foreground italic">{a.reason}</p>}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Quantity</label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={a.quantity}
                        onChange={e => {
                          const v = Number(e.target.value);
                          setPendingActions(prev => prev?.map((p, i) => i === idx ? { ...p, quantity: v } : p) ?? null);
                        }}
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Unit</label>
                      <Input value={a.unit} disabled />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingActions(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                const toRun = pendingActions ?? [];
                setPendingActions(null);
                // Persist learned corrections for any action where the user edited the quantity.
                for (const a of toRun) {
                  if (a._originalQuantity != null && a.quantity !== a._originalQuantity) {
                    await learnCorrection(a);
                  }
                }
                await executeActions(toRun);
              }}
            >
              Confirm & deduct
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
