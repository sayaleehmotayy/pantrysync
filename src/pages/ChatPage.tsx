import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, MessageCircle, ShoppingCart, Plus, Mic, MicOff, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useShoppingList } from '@/hooks/useShoppingList';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MentionAutocomplete from '@/components/chat/MentionAutocomplete';

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  household_id: string;
  sender_name?: string;
}

interface ReadReceipt {
  user_id: string;
  last_read_message_id: string;
  last_read_at: string;
}

interface MentionTarget {
  userId: string;
  label: string;
}

interface MentionOption {
  id: string;
  label: string;
  isEveryone?: boolean;
  normalizedLabel: string;
}

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Other'];

const normalizeDisplayName = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ');

const isMentionBoundary = (value?: string) => !value || /[\s.,!?;:()\[\]{}"']/.test(value);

export default function ChatPage() {
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const { addItem } = useShoppingList();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [addToListMsg, setAddToListMsg] = useState<ChatMessage | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemCategory, setItemCategory] = useState('Other');
  const [, setTick] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [aiParsing, setAiParsing] = useState<string | null>(null); // message id being parsed
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map(
    members.map((member) => [member.user_id, normalizeDisplayName(member.profile?.display_name) || 'Unknown'])
  );

  const mentionOptions: MentionOption[] = [
    { id: 'everyone', label: 'Everyone', isEveryone: true, normalizedLabel: 'everyone' },
    ...members
      .filter((member) => member.user_id !== user?.id)
      .map((member) => {
        const label = normalizeDisplayName(member.profile?.display_name) || 'Unknown';
        return { id: member.user_id, label, normalizedLabel: label.toLowerCase() };
      }),
  ];

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!household) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('household_id', household.id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('[chat] failed to load messages', error);
        setLoading(false);
        return;
      }

      if (data) {
        setMessages(data.map((message) => ({ ...message, sender_name: memberMap.get(message.user_id) || 'Unknown' })));
      }
      setLoading(false);
    };

    void fetchMessages();

    const channel = supabase
      .channel(`chat-${household.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `household_id=eq.${household.id}` },
        (payload) => {
          const message = payload.new as ChatMessage;
          message.sender_name = memberMap.get(message.user_id) || 'Unknown';
          setMessages((prev) => [...prev, message]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [household, members]);

  // Read receipts
  useEffect(() => {
    if (!household) return;
    const fetchReceipts = async () => {
      const { data } = await supabase
        .from('chat_read_receipts')
        .select('user_id, last_read_message_id, last_read_at')
        .eq('household_id', household.id);
      if (data) setReadReceipts(data);
    };
    void fetchReceipts();

    const channel = supabase
      .channel(`read-receipts-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_read_receipts', filter: `household_id=eq.${household.id}` }, (payload) => {
        const updated = payload.new as any;
        setReadReceipts(prev => {
          const filtered = prev.filter(r => r.user_id !== updated.user_id);
          return [...filtered, { user_id: updated.user_id, last_read_message_id: updated.last_read_message_id, last_read_at: updated.last_read_at }];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [household]);

  // Update own read receipt
  useEffect(() => {
    if (!household || !user || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const myReceipt = readReceipts.find(r => r.user_id === user.id);
    if (myReceipt?.last_read_message_id === lastMsg.id) return;

    const updateReceipt = async () => {
      await supabase
        .from('chat_read_receipts')
        .upsert({ household_id: household.id, user_id: user.id, last_read_message_id: lastMsg.id, last_read_at: new Date().toISOString() }, { onConflict: 'household_id,user_id' });
    };
    void updateReceipt();
  }, [household, user, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // AI-powered quick add: parses a message and adds extracted items to shopping list
  const quickAddFromMessage = useCallback(async (msg: ChatMessage) => {
    if (!msg.content.trim()) return;
    setAiParsing(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke('parse-shopping-items', {
        body: { message: msg.content },
      });

      if (error) {
        console.error('AI parse error:', error);
        toast.error('Failed to parse items');
        return;
      }

      const items = data?.items;
      if (items && items.length > 0) {
        for (const item of items) {
          addItem.mutate({
            name: item.name,
            quantity: item.quantity || 1,
            unit: item.unit || 'pieces',
            category: item.category || 'Other',
          });
        }
        toast.success(`✨ Added ${items.length} item${items.length > 1 ? 's' : ''} to shopping list`, {
          description: items.map((i: any) => `${i.quantity} ${i.unit} ${i.name}`).join(', '),
        });
      } else {
        // No items detected, open manual dialog
        setAddToListMsg(msg);
        setItemName(msg.content.slice(0, 50));
      }
    } catch (error) {
      console.error('Failed to parse shopping items:', error);
      toast.error('Failed to parse items');
    } finally {
      setAiParsing(null);
    }
  }, [addItem]);

  const extractMentions = useCallback((content: string): MentionTarget[] => {
    const mentionTargets: MentionTarget[] = [];
    const mentionStartPattern = /(^|\s)@/g;
    const sortedOptions = [...mentionOptions].sort(
      (left, right) => right.normalizedLabel.length - left.normalizedLabel.length,
    );
    let mentionStart: RegExpExecArray | null;

    while ((mentionStart = mentionStartPattern.exec(content)) !== null) {
      const rawAfterAt = content.slice(mentionStart.index + mentionStart[0].length);
      const normalizedAfterAt = rawAfterAt.replace(/\s+/g, ' ').trimStart().toLowerCase();
      const matchedOption = sortedOptions.find(
        (option) =>
          normalizedAfterAt.startsWith(option.normalizedLabel) &&
          isMentionBoundary(normalizedAfterAt[option.normalizedLabel.length]),
      );

      if (!matchedOption) continue;

      if (matchedOption.isEveryone) {
        members.forEach((member) => {
          if (member.user_id === user?.id) return;
          mentionTargets.push({
            userId: member.user_id,
            label: normalizeDisplayName(member.profile?.display_name) || 'Unknown',
          });
        });
        continue;
      }

      if (matchedOption.id !== user?.id) {
        mentionTargets.push({ userId: matchedOption.id, label: matchedOption.label });
      }
    }

    return Array.from(new Map(mentionTargets.map((t) => [t.userId, t])).values());
  }, [members, mentionOptions, user?.id]);

  const sendMentionNotifications = useCallback(async (content: string, chatMessageId: string) => {
    if (!user?.id || !household?.id) return;
    const mentionTargets = extractMentions(content);
    if (mentionTargets.length === 0) return;

    const senderName = memberMap.get(user.id) || 'Someone';
    await supabase.functions.invoke('send-push-notification', {
      body: {
        mentioned_user_ids: mentionTargets.map((t) => t.userId),
        sender_name: senderName,
        message: content,
        household_id: household.id,
        chat_message_id: chatMessageId,
        sender_id: user.id,
      },
    });
  }, [extractMentions, household?.id, memberMap, user?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !household) return;

    const content = newMessage.trim();
    const { data: insertedMsg, error } = await supabase
      .from('chat_messages')
      .insert({ household_id: household.id, user_id: user.id, content })
      .select('id')
      .single();

    if (error || !insertedMsg) {
      toast.error('Failed to send message');
      return;
    }

    setNewMessage('');
    setShowMentions(false);

    // Only send mention notifications — no auto-parsing
    void sendMentionNotifications(content, insertedMsg.id);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNewMessage(value);

    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(atIndex + 1).replace(/\s+/g, ' ').trimStart();
      const hasSpace = textAfterAt.includes(' ') && !mentionOptions.some((option) =>
        option.normalizedLabel.startsWith(textAfterAt.toLowerCase()),
      );

      if ((charBeforeAt === ' ' || atIndex === 0) && !hasSpace) {
        setShowMentions(true);
        setMentionFilter(textAfterAt);
        setMentionCursorPos(atIndex);
        return;
      }
    }
    setShowMentions(false);
  };

  const handleMentionSelect = (option: { id: string; label: string }) => {
    const selectedLabel = normalizeDisplayName(option.label) || option.label.trim();
    const textBefore = newMessage.slice(0, mentionCursorPos);
    const textAfterCursor = newMessage.slice(inputRef.current?.selectionStart || mentionCursorPos);
    const remainder = textAfterCursor.replace(/^\S*/, '').trimStart();
    const newValue = `${textBefore}@${selectedLabel}${remainder ? ` ${remainder}` : ' '}`;

    setNewMessage(newValue);
    setShowMentions(false);

    setTimeout(() => {
      inputRef.current?.focus();
      const pos = textBefore.length + selectedLabel.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const toggleListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setNewMessage(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied.');
      }
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const handleAddToList = () => {
    if (!itemName.trim()) return;
    addItem.mutate({ name: itemName, quantity: Number(itemQty) || 1, unit: 'pieces', category: itemCategory });
    setAddToListMsg(null);
    setItemName('');
    setItemQty('1');
    setItemCategory('Other');
  };

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+(?:\s\w+)*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.slice(1).toLowerCase();
        const isMention = name === 'everyone' || members.some(m =>
          (m.profile?.display_name || '').toLowerCase() === name
        );
        if (isMention) {
          return (
            <span key={i} className="bg-primary/20 text-primary font-semibold rounded px-0.5">
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-display font-bold">Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAddToListMsg({ id: '', user_id: '', content: '', created_at: '', household_id: '' }); setItemName(''); }}
            className="h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <ShoppingCart className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">{members.length} members</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display font-semibold">No messages yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Start the conversation!</p>
            <p className="text-muted-foreground text-xs mt-2 max-w-[260px]">
              🛒 Tap the <ShoppingCart className="w-3 h-3 inline" /> icon on any message to add items to your shopping list.
            </p>
            <p className="text-muted-foreground text-xs mt-1 max-w-[260px]">
              💬 Type <span className="font-semibold text-primary">@</span> to mention someone.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            const seenByMembers = readReceipts
              .filter(r => r.last_read_message_id === msg.id && r.user_id !== msg.user_id && r.user_id !== user?.id)
              .map(r => ({
                userId: r.user_id,
                name: memberMap.get(r.user_id) || 'Someone',
              }));
            const isParsing = aiParsing === msg.id;

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] group">
                  {!isMe && (
                    <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender_name}</p>
                  )}
                  <div className={`rounded-2xl px-3 py-2 text-sm transition-all duration-200 ${isMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                    {renderMessageContent(msg.content)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                    <button
                      onClick={() => quickAddFromMessage(msg)}
                      disabled={!!aiParsing}
                      className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5 disabled:opacity-50"
                    >
                      {isParsing ? (
                        <><Sparkles className="w-3 h-3 animate-spin" /> Adding...</>
                      ) : (
                        <><ShoppingCart className="w-3 h-3" /> Add to list</>
                      )}
                    </button>
                  </div>
                  {seenByMembers.length > 0 && (
                    <div className={`flex items-center mt-0.5 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[9px] text-muted-foreground animate-fade-in">
                        Seen by {seenByMembers.map(m => m.name).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="relative">
        {showMentions && (
          <MentionAutocomplete
            options={mentionOptions}
            onSelect={handleMentionSelect}
            position={{ top: 48, left: 48 }}
            filter={mentionFilter}
          />
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <Button
            type="button"
            size="icon"
            variant={isListening ? 'default' : 'outline'}
            onClick={toggleListening}
            className={`shrink-0 transition-all duration-200 active:scale-95 ${isListening ? 'bg-destructive hover:bg-destructive/90 animate-pulse' : ''}`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Input
            ref={inputRef}
            placeholder={isListening ? 'Listening...' : 'Type a message... use @ to mention'}
            value={newMessage}
            onChange={handleInputChange}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()} className="transition-transform duration-200 active:scale-95">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>

      <Dialog open={!!addToListMsg} onOpenChange={open => !open && setAddToListMsg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Shopping List</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Item name" value={itemName} onChange={e => setItemName(e.target.value)} />
            <div className="flex gap-3">
              <Input type="number" placeholder="Quantity" value={itemQty} onChange={e => setItemQty(e.target.value)} min="1" className="flex-1" />
              <Select value={itemCategory} onValueChange={setItemCategory}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAddToList}>Add to Shopping List</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
