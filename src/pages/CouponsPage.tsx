import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Camera, Tag, Store, Copy, Calendar, Image as ImageIcon,
  X, Search, Clock, Info, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Loader2,
} from 'lucide-react';
import { format, isBefore, differenceInDays } from 'date-fns';
import { STORE_REGIONS, ALL_STORE_NAMES, findStoreInfo, type StoreInfo } from '@/config/stores';
import { BarcodeDialog } from '@/components/BarcodeDialog';

interface DiscountCode {
  id: string;
  store_name: string;
  code: string;
  description: string | null;
  receipt_image_url: string | null;
  expiry_date: string | null;
  added_by: string;
  created_at: string;
  title: string | null;
  discount_text: string | null;
  min_spend: number | null;
  restrictions: string | null;
  conditions: string | null;
  valid_from: string | null;
  status: string;
  expired_at: string | null;
  delete_after: string | null;
  ai_confidence: any;
}

interface ExtractedCoupon {
  store_name?: string;
  title?: string;
  code?: string;
  discount_text?: string;
  description?: string;
  expiry_date?: string;
  valid_from?: string;
  min_spend?: number;
  restrictions?: string;
  conditions?: string;
  confidence?: Record<string, 'high' | 'medium' | 'low'>;
}

const RECENTLY_USED_KEY = 'pantrysync_recent_stores';
function getRecentStores(): string[] { try { return JSON.parse(localStorage.getItem(RECENTLY_USED_KEY) || '[]'); } catch { return []; } }
function addRecentStore(name: string) {
  const r = getRecentStores().filter(s => s !== name);
  r.unshift(name);
  localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(r.slice(0, 10)));
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function CouponsPage() {
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [storeInfoModal, setStoreInfoModal] = useState<StoreInfo | null>(null);
  const [barcodeFor, setBarcodeFor] = useState<DiscountCode | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);

  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [browseMode, setBrowseMode] = useState(false);

  // Code form state
  const [storeName, setStoreName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);

  // Photo / extracted form state
  const [photoStoreName, setPhotoStoreName] = useState('');
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoCode, setPhotoCode] = useState('');
  const [photoDiscountText, setPhotoDiscountText] = useState('');
  const [photoDescription, setPhotoDescription] = useState('');
  const [photoExpiryDate, setPhotoExpiryDate] = useState('');
  const [photoValidFrom, setPhotoValidFrom] = useState('');
  const [photoMinSpend, setPhotoMinSpend] = useState('');
  const [photoRestrictions, setPhotoRestrictions] = useState('');
  const [photoConditions, setPhotoConditions] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedConfidence, setExtractedConfidence] = useState<Record<string, string> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map(members.map(m => [m.user_id, m.profile?.display_name || 'Unknown']));
  const recentStores = getRecentStores();

  useEffect(() => { if (household) fetchCodes(); }, [household]);

  const fetchCodes = async () => {
    if (!household) return;
    const { data, error } = await supabase
      .from('discount_codes').select('*').eq('household_id', household.id);
    if (error) { console.error(error); setLoading(false); return; }
    setCodes((data || []) as DiscountCode[]);
    const urls: Record<string, string> = {};
    await Promise.all((data || []).filter(d => d.receipt_image_url).map(async (d) => {
      urls[d.id] = await getSignedUrl(d.receipt_image_url!);
    }));
    setSignedUrls(urls);
    setLoading(false);
  };

  const doAiSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setAiResults([]); return; }
    setSearching(true);
    try {
      const lower = q.toLowerCase();
      const localMatches = ALL_STORE_NAMES.filter(n => n.toLowerCase().includes(lower));
      const { data, error } = await supabase.functions.invoke('search-stores', { body: { query: q } });
      if (!error && data?.results) {
        setAiResults([...new Set([...localMatches, ...data.results])].slice(0, 12));
      } else setAiResults(localMatches.slice(0, 12));
    } catch {
      const lower = q.toLowerCase();
      setAiResults(ALL_STORE_NAMES.filter(n => n.toLowerCase().includes(lower)).slice(0, 12));
    }
    setSearching(false);
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => doAiSearch(val), 400);
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    const dataUrl = await fileToBase64(file);
    setCapturedImage(dataUrl);
    // Auto-extract
    runExtraction(dataUrl);
  };

  const runExtraction = async (dataUrl: string) => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-coupon', {
        body: { image_base64: dataUrl },
      });
      if (error) { toast.error('AI extraction failed — please fill manually'); return; }
      const ex: ExtractedCoupon = data?.extracted || {};
      if (ex.store_name) setPhotoStoreName(ex.store_name);
      if (ex.title) setPhotoTitle(ex.title);
      if (ex.code) setPhotoCode(ex.code);
      if (ex.discount_text) setPhotoDiscountText(ex.discount_text);
      if (ex.description) setPhotoDescription(ex.description);
      if (ex.expiry_date) setPhotoExpiryDate(ex.expiry_date);
      if (ex.valid_from) setPhotoValidFrom(ex.valid_from);
      if (typeof ex.min_spend === 'number') setPhotoMinSpend(String(ex.min_spend));
      if (ex.restrictions) setPhotoRestrictions(ex.restrictions);
      if (ex.conditions) setPhotoConditions(ex.conditions);
      setExtractedConfidence(ex.confidence || null);

      const filled = [ex.store_name, ex.title, ex.code, ex.expiry_date].filter(Boolean).length;
      if (filled > 0) toast.success(`AI extracted ${filled} field${filled > 1 ? 's' : ''} — review & save`);
      else toast.info('AI could not extract details — please fill manually');
    } catch (e) {
      console.error(e);
      toast.error('AI extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const uploadReceiptImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipt-images').upload(filePath, file);
    if (error) { toast.error('Failed to upload image'); return null; }
    return filePath;
  };

  const getSignedUrl = async (filePath: string): Promise<string> => {
    if (filePath.startsWith('http')) return filePath;
    const { data } = await supabase.storage.from('receipt-images').createSignedUrl(filePath, 3600);
    return data?.signedUrl || '';
  };

  const selectStoreForCode = (name: string) => { setStoreName(name); addRecentStore(name); setCodeDialogOpen(true); };
  const selectStoreForPhoto = (name: string) => { setPhotoStoreName(name); addRecentStore(name); setPhotoDialogOpen(true); };

  const handleCodeSubmit = async () => {
    if (!household || !user) return;
    if (!storeName.trim() || !code.trim()) { toast.error('Store and code are required'); return; }
    setUploading(true);
    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id, store_name: storeName.trim(), code: code.trim(),
      description: description.trim() || null, receipt_image_url: null,
      expiry_date: expiryDate || null, added_by: user.id, status: 'active',
    });
    if (error) toast.error('Failed to save discount code');
    else { toast.success(`Code for ${storeName} saved!`); addRecentStore(storeName); resetCodeForm(); setCodeDialogOpen(false); fetchCodes(); }
    setUploading(false);
  };

  const handlePhotoSubmit = async () => {
    if (!household || !user || !capturedFile) { toast.error('Please take or upload a photo'); return; }
    if (!photoStoreName.trim()) { toast.error('Please enter a store name'); return; }

    // Low-confidence date guard
    const expiryConf = extractedConfidence?.expiry_date;
    if (photoExpiryDate && expiryConf === 'low') {
      const ok = window.confirm(`AI is unsure about the expiry date "${photoExpiryDate}". Confirm to save?`);
      if (!ok) return;
    }

    setUploading(true);
    const imageUrl = await uploadReceiptImage(capturedFile);
    if (!imageUrl) { setUploading(false); return; }

    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id,
      store_name: photoStoreName.trim(),
      code: photoCode.trim() || 'RECEIPT',
      title: photoTitle.trim() || null,
      discount_text: photoDiscountText.trim() || null,
      description: photoDescription.trim() || 'Receipt photo',
      receipt_image_url: imageUrl,
      expiry_date: photoExpiryDate || null,
      valid_from: photoValidFrom || null,
      min_spend: photoMinSpend ? Number(photoMinSpend) : null,
      restrictions: photoRestrictions.trim() || null,
      conditions: photoConditions.trim() || null,
      added_by: user.id,
      status: 'active',
      extracted_at: extractedConfidence ? new Date().toISOString() : null,
      ai_confidence: extractedConfidence || null,
    });
    if (error) toast.error('Failed to save');
    else { toast.success(`Coupon for ${photoStoreName} saved!`); addRecentStore(photoStoreName); resetPhotoForm(); setPhotoDialogOpen(false); fetchCodes(); }
    setUploading(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('discount_codes').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { setCodes(prev => prev.filter(c => c.id !== id)); toast.success('Deleted'); }
  };

  const copyCode = (codeText: string) => { navigator.clipboard.writeText(codeText); toast.success('Code copied!'); };

  const resetCodeForm = () => { setStoreName(''); setCode(''); setDescription(''); setExpiryDate(''); };
  const resetPhotoForm = () => {
    setPhotoStoreName(''); setPhotoTitle(''); setPhotoCode(''); setPhotoDiscountText('');
    setPhotoDescription(''); setPhotoExpiryDate(''); setPhotoValidFrom('');
    setPhotoMinSpend(''); setPhotoRestrictions(''); setPhotoConditions('');
    setCapturedImage(null); setCapturedFile(null); setExtractedConfidence(null);
  };

  const isExpired = (date: string | null) => date ? isBefore(new Date(date), new Date(new Date().setHours(0,0,0,0))) : false;
  const daysToExpiry = (date: string | null): number | null => date ? differenceInDays(new Date(date), new Date(new Date().setHours(0,0,0,0))) : null;

  const toggleRegion = (key: string) => {
    setExpandedRegions(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  // Default sort: expiring soonest, then highest min_spend (proxy for value), then newest
  const sortedCodes = useMemo(() => {
    return [...codes].sort((a, b) => {
      const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      if (aExp !== bExp) return aExp - bExp;
      const aVal = a.min_spend || 0; const bVal = b.min_spend || 0;
      if (aVal !== bVal) return bVal - aVal;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [codes]);

  const filteredCodes = searchQuery.trim().length > 0
    ? sortedCodes.filter(c =>
        c.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedCodes;

  const StoreChip = ({ name, onAddCode, onAddPhoto }: { name: string; onAddCode: () => void; onAddPhoto: () => void }) => {
    const info = findStoreInfo(name);
    return (
      <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl px-2.5 py-1.5 text-sm">
        <Store className="w-3 h-3 text-primary shrink-0" />
        <span className="font-medium truncate">{name}</span>
        {info && (
          <button onClick={() => setStoreInfoModal(info)} className="shrink-0 text-muted-foreground hover:text-foreground">
            <Info className="w-3 h-3" />
          </button>
        )}
        <div className="flex gap-0.5 ml-auto shrink-0">
          <button onClick={onAddCode} className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center"><Tag className="w-3 h-3 text-primary" /></button>
          <button onClick={onAddPhoto} className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center"><Camera className="w-3 h-3 text-primary" /></button>
        </div>
      </div>
    );
  };

  const ConfBadge = ({ field }: { field: string }) => {
    const c = extractedConfidence?.[field];
    if (!c) return null;
    const color = c === 'high' ? 'bg-primary/10 text-primary' : c === 'medium' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-destructive/10 text-destructive';
    return <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${color}`}>AI · {c}</span>;
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">Coupons & Deals</h1>
          <p className="text-xs text-muted-foreground mt-0.5">AI-powered · sorted by expiring soonest</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { resetPhotoForm(); setPhotoDialogOpen(true); }} className="gap-1.5">
            <Sparkles className="w-4 h-4" /> Scan
          </Button>
          <Button size="sm" onClick={() => { resetCodeForm(); setCodeDialogOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Code
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search shops or coupons..." value={searchQuery} onChange={e => handleSearchChange(e.target.value)} className="pl-9 pr-10" />
        {searching && <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-pulse" />}
      </div>

      {searchQuery.trim().length >= 2 && aiResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Matching shops</p>
          <div className="grid grid-cols-1 gap-1.5">
            {aiResults.map(name => <StoreChip key={name} name={name} onAddCode={() => selectStoreForCode(name)} onAddPhoto={() => selectStoreForPhoto(name)} />)}
          </div>
        </div>
      )}

      {!searchQuery && recentStores.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recently Used</p>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {recentStores.slice(0, 5).map(name => <StoreChip key={name} name={name} onAddCode={() => selectStoreForCode(name)} onAddPhoto={() => selectStoreForPhoto(name)} />)}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading...</div>
      ) : filteredCodes.length === 0 && codes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4"><Tag className="w-8 h-8 text-muted-foreground" /></div>
          <h3 className="font-display font-semibold">No coupons yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Tap <span className="font-semibold">Scan</span> to extract a coupon photo with AI</p>
        </div>
      ) : filteredCodes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No coupons match "{searchQuery}"</p>
      ) : (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">Expiring Soon — Your Coupons ({filteredCodes.length})</h2>
          {filteredCodes.map(item => {
            const days = daysToExpiry(item.expiry_date);
            const expired = isExpired(item.expiry_date) || item.status === 'expired';
            const expiringSoon = !expired && days !== null && days <= 2;
            return (
              <Card key={item.id} className={`border-border/50 overflow-hidden ${expired ? 'opacity-60 border-destructive/30' : expiringSoon ? 'border-amber-500/50' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {item.receipt_image_url && signedUrls[item.id] && (
                      <button onClick={() => setPreviewImage(signedUrls[item.id])} className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border bg-muted">
                        <img src={signedUrls[item.id]} alt="Coupon" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Store className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-xs font-semibold">{item.store_name}</span>
                        {expired && <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Expired</span>}
                        {expiringSoon && (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                          </span>
                        )}
                      </div>
                      {item.title && <p className="text-sm font-medium mt-1 truncate">{item.title}</p>}
                      {item.discount_text && !item.title && <p className="text-sm font-medium mt-1 text-primary truncate">{item.discount_text}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.code && item.code !== 'RECEIPT' && (
                          <button onClick={() => setBarcodeFor(item)} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                            <Tag className="w-3 h-3 text-primary" />
                            <span className="font-mono font-bold text-xs text-primary">{item.code}</span>
                            <span className="text-[9px] uppercase tracking-wider text-primary/70 font-semibold">Show</span>
                          </button>
                        )}
                        {item.code && item.code !== 'RECEIPT' && (
                          <button onClick={() => copyCode(item.code)} className="w-6 h-6 rounded-lg bg-muted hover:bg-muted/70 flex items-center justify-center" title="Copy code">
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                        {item.code === 'RECEIPT' && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Camera className="w-3 h-3" /> Photo</span>}
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>}
                      {(item.min_spend || item.conditions) && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">
                          {item.min_spend ? `Min spend ${item.min_spend} · ` : ''}{item.conditions || ''}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>by {memberMap.get(item.added_by) || 'Unknown'}</span>
                        {item.expiry_date && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Calendar className="w-2.5 h-2.5" />
                              {format(new Date(item.expiry_date), 'MMM d, yyyy')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCode(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <button onClick={() => setBrowseMode(!browseMode)} className="flex items-center gap-2 px-1 w-full">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Browse Shops by Region</h2>
          {browseMode ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        {browseMode && STORE_REGIONS.map(region => (
          <div key={region.key} className="border border-border/50 rounded-xl overflow-hidden">
            <button onClick={() => toggleRegion(region.key)} className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors">
              <span className="flex items-center gap-2">
                <span className="text-lg">{region.emoji}</span>
                <span className="text-sm font-semibold">{region.label}</span>
                <span className="text-[10px] text-muted-foreground">({region.stores.length})</span>
              </span>
              {expandedRegions.has(region.key) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {expandedRegions.has(region.key) && (
              <div className="px-3 pb-3 space-y-1.5">
                {region.stores.map(store => (
                  <div key={store.name} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{store.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{store.couponType}</span>
                    </div>
                    <button onClick={() => setStoreInfoModal(store)} className="shrink-0 text-muted-foreground hover:text-foreground"><Info className="w-3.5 h-3.5" /></button>
                    <button onClick={() => selectStoreForCode(store.name)} className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center"><Plus className="w-3 h-3 text-primary" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Code Dialog */}
      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Discount Code</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Store</label>
              <Input placeholder="Store name" value={storeName} onChange={e => setStoreName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Discount Code</label>
              <Input placeholder="e.g. SAVE20" value={code} onChange={e => setCode(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
              <Input placeholder="e.g. 20% off all groceries" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expiry Date (optional)</label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleCodeSubmit} disabled={uploading}>
              {uploading ? 'Saving...' : 'Save Discount Code'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Dialog with AI Extraction */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Scan Coupon
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Photo</label>
              {capturedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={capturedImage} alt="Coupon" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={() => { setCapturedImage(null); setCapturedFile(null); setExtractedConfidence(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {extracting && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center backdrop-blur-sm">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        AI is reading your coupon...
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 gap-2" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="w-4 h-4" /> Take Photo
                  </Button>
                  <Button type="button" variant="outline" className="flex-1 gap-2" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon className="w-4 h-4" /> Upload
                  </Button>
                </div>
              )}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCapture} />
            </div>

            {capturedImage && !extracting && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1"><label className="text-xs text-muted-foreground">Store</label><ConfBadge field="store_name" /></div>
                  <Input placeholder="Store name" value={photoStoreName} onChange={e => setPhotoStoreName(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1"><label className="text-xs text-muted-foreground">Offer title</label><ConfBadge field="title" /></div>
                  <Input placeholder="e.g. 20% off groceries" value={photoTitle} onChange={e => setPhotoTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs text-muted-foreground">Code</label><ConfBadge field="code" /></div>
                    <Input placeholder="SAVE20" value={photoCode} onChange={e => setPhotoCode(e.target.value)} className="font-mono" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs text-muted-foreground">Discount</label><ConfBadge field="discount_text" /></div>
                    <Input placeholder="20% off" value={photoDiscountText} onChange={e => setPhotoDiscountText(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs text-muted-foreground">Valid from</label><ConfBadge field="valid_from" /></div>
                    <Input type="date" value={photoValidFrom} onChange={e => setPhotoValidFrom(e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground font-semibold">Expires *</label>
                      <ConfBadge field="expiry_date" />
                    </div>
                    <Input type="date" value={photoExpiryDate} onChange={e => setPhotoExpiryDate(e.target.value)}
                      className={extractedConfidence?.expiry_date === 'low' ? 'border-amber-500' : ''} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Min spend</label>
                  <Input type="number" placeholder="0" value={photoMinSpend} onChange={e => setPhotoMinSpend(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Restrictions</label>
                  <Input placeholder="e.g. Selected groceries only" value={photoRestrictions} onChange={e => setPhotoRestrictions(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conditions</label>
                  <Input placeholder="e.g. In-store only, one-time use" value={photoConditions} onChange={e => setPhotoConditions(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea placeholder="Anything else..." value={photoDescription} onChange={e => setPhotoDescription(e.target.value)} rows={2} />
                </div>
              </>
            )}

            <Button className="w-full" onClick={handlePhotoSubmit} disabled={uploading || extracting || !capturedFile}>
              {uploading ? 'Saving...' : extracting ? 'AI extracting...' : 'Save Coupon'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Store Info Modal */}
      <Dialog open={!!storeInfoModal} onOpenChange={() => setStoreInfoModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Store className="w-4 h-4 text-primary" />{storeInfoModal?.name}</DialogTitle>
          </DialogHeader>
          {storeInfoModal && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Coupon System</p>
                <p className="text-sm font-medium mt-0.5">{storeInfoModal.couponType}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">How It Works</p>
                <p className="text-sm mt-0.5">{storeInfoModal.couponTip}</p>
              </div>
              <Button className="w-full" onClick={() => { selectStoreForCode(storeInfoModal.name); setStoreInfoModal(null); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Code for {storeInfoModal.name}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => setPreviewImage(null)}>
            <X className="w-5 h-5" />
          </button>
          <img src={previewImage} alt="Coupon" className="max-w-full max-h-[85vh] rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
