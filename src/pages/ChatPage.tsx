import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, MessageCircle, ShoppingCart, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useShoppingList } from '@/hooks/useShoppingList';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Other'];

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const memberMap = new Map(members.map(m => [m.user_id, m.profile?.display_name || 'Unknown']));

  // Auto-refresh timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!household) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('household_id', household.id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (data) {
        setMessages(data.map(m => ({ ...m, sender_name: memberMap.get(m.user_id) || 'Unknown' })));
      }
      setLoading(false);
    };

    fetchMessages();

    const channel = supabase
      .channel(`chat-${household.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `household_id=eq.${household.id}`,
      }, (payload) => {
        const msg = payload.new as ChatMessage;
        msg.sender_name = memberMap.get(msg.user_id) || 'Unknown';
        setMessages(prev => [...prev, msg]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [household, members]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !household) return;

    await supabase.from('chat_messages').insert({
      household_id: household.id,
      user_id: user.id,
      content: newMessage.trim(),
    });

    setNewMessage('');
  };

  const handleAddToList = () => {
    if (!itemName.trim()) return;
    addItem.mutate({ name: itemName, quantity: Number(itemQty) || 1, unit: 'pieces', category: itemCategory });
    setAddToListMsg(null);
    setItemName('');
    setItemQty('1');
    setItemCategory('Other');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-display font-bold">Chat</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAddToListMsg({ id: '', user_id: '', content: '', created_at: '' }); setItemName(''); }}
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
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] group`}>
                  {!isMe && (
                    <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender_name}</p>
                  )}
                  <div className={`rounded-2xl px-3 py-2 text-sm transition-all duration-200 ${isMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                    <button
                      onClick={() => { setAddToListMsg(msg); setItemName(msg.content.slice(0, 50)); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5"
                    >
                      <ShoppingCart className="w-3 h-3" /> Add to list
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={sendMessage} className="flex gap-2">
        <Input
          placeholder="Type a message..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!newMessage.trim()} className="transition-transform duration-200 active:scale-95">
          <Send className="w-4 h-4" />
        </Button>
      </form>

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
