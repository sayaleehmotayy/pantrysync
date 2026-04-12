import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Camera, Tag, Store, Copy, Calendar, Image as ImageIcon,
  X, Search, Clock, Info, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { STORE_REGIONS, ALL_STORE_NAMES, findStoreInfo, type StoreInfo } from '@/config/stores';

interface DiscountCode {
  id: string;
  store_name: string;
  code: string;
  description: string | null;
  receipt_image_url: string | null;
  expiry_date: string | null;
  added_by: string;
  created_at: string;
}

const RECENTLY_USED_KEY = 'pantrysync_recent_stores';

function getRecentStores(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_USED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentStore(name: string) {
  const recents = getRecentStores().filter(s => s !== name);
  recents.unshift(name);
  localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(recents.slice(0, 10)));
}

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

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);

  // Browse
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [browseMode, setBrowseMode] = useState(false);

  // Code form state
  const [storeName, setStoreName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);

  // Photo form state
  const [photoStoreName, setPhotoStoreName] = useState('');
  const [photoExpiryDate, setPhotoExpiryDate] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map(
    members.map(m => [m.user_id, m.profile?.display_name || 'Unknown'])
  );

  const recentStores = getRecentStores();

  useEffect(() => {
    if (!household) return;
    fetchCodes();
  }, [household]);

  const fetchCodes = async () => {
    if (!household) return;
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch codes:', error);
    } else {
      setCodes(data || []);
      const urls: Record<string, string> = {};
      await Promise.all((data || []).filter(d => d.receipt_image_url).map(async (d) => {
        urls[d.id] = await getSignedUrl(d.receipt_image_url!);
      }));
      setSignedUrls(urls);
    }
    setLoading(false);
  };

  // AI-powered search with debounce
  const doAiSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setAiResults([]); return; }
    setSearching(true);
    try {
      // First do local fuzzy match
      const lower = q.toLowerCase();
      const localMatches = ALL_STORE_NAMES.filter(n => n.toLowerCase().includes(lower));

      // Then call AI for fuzzy/intent matching
      const { data, error } = await supabase.functions.invoke('search-stores', {
        body: { query: q },
      });
      if (!error && data?.results) {
        const combined = [...new Set([...localMatches, ...data.results])];
        setAiResults(combined.slice(0, 12));
      } else {
        setAiResults(localMatches.slice(0, 12));
      }
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

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCapturedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
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

  const selectStoreForCode = (name: string) => {
    setStoreName(name);
    addRecentStore(name);
    setCodeDialogOpen(true);
  };

  const selectStoreForPhoto = (name: string) => {
    setPhotoStoreName(name);
    addRecentStore(name);
    setPhotoDialogOpen(true);
  };

  const handleCodeSubmit = async () => {
    if (!household || !user) return;
    if (!storeName.trim() || !code.trim()) {
      toast.error('Store and code are required'); return;
    }
    setUploading(true);
    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id,
      store_name: storeName.trim(),
      code: code.trim(),
      description: description.trim() || null,
      receipt_image_url: null,
      expiry_date: expiryDate || null,
      added_by: user.id,
    });
    if (error) {
      toast.error('Failed to save discount code');
    } else {
      toast.success(`Code for ${storeName} saved!`);
      addRecentStore(storeName);
      resetCodeForm();
      setCodeDialogOpen(false);
      fetchCodes();
    }
    setUploading(false);
  };

  const handlePhotoSubmit = async () => {
    if (!household || !user || !capturedFile) {
      toast.error('Please take or upload a photo'); return;
    }
    if (!photoStoreName.trim()) {
      toast.error('Please enter a store name'); return;
    }
    setUploading(true);
    const imageUrl = await uploadReceiptImage(capturedFile);
    if (!imageUrl) { setUploading(false); return; }

    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id,
      store_name: photoStoreName.trim(),
      code: 'RECEIPT',
      description: 'Receipt photo',
      receipt_image_url: imageUrl,
      expiry_date: photoExpiryDate || null,
      added_by: user.id,
    });
    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success(`Receipt for ${photoStoreName} saved!`);
      addRecentStore(photoStoreName);
      resetPhotoForm();
      setPhotoDialogOpen(false);
      fetchCodes();
    }
    setUploading(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('discount_codes').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); }
    else { setCodes(prev => prev.filter(c => c.id !== id)); toast.success('Deleted'); }
  };

  const copyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    toast.success('Code copied!');
  };

  const resetCodeForm = () => {
    setStoreName(''); setCode(''); setDescription(''); setExpiryDate('');
  };

  const resetPhotoForm = () => {
    setPhotoStoreName(''); setPhotoExpiryDate('');
    setCapturedImage(null); setCapturedFile(null);
  };

  const isExpired = (date: string | null) => date ? isBefore(new Date(date), new Date()) : false;

  const toggleRegion = (key: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Group saved codes by store
  const grouped = codes.reduce<Record<string, DiscountCode[]>>((acc, c) => {
    (acc[c.store_name] = acc[c.store_name] || []).push(c);
    return acc;
  }, {});

  // Filter codes by search
  const filteredCodes = searchQuery.trim().length > 0
    ? codes.filter(c =>
        c.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : codes;

  const filteredGrouped = filteredCodes.reduce<Record<string, DiscountCode[]>>((acc, c) => {
    (acc[c.store_name] = acc[c.store_name] || []).push(c);
    return acc;
  }, {});

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
          <button onClick={onAddCode} className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
            <Tag className="w-3 h-3 text-primary" />
          </button>
          <button onClick={onAddPhoto} className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
            <Camera className="w-3 h-3 text-primary" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">Coupons & Deals</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Save & share discount codes</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { resetPhotoForm(); setPhotoDialogOpen(true); }} className="gap-1.5">
            <Camera className="w-4 h-4" /> Photo
          </Button>
          <Button size="sm" onClick={() => { resetCodeForm(); setCodeDialogOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Code
          </Button>
        </div>
      </div>

      {/* AI Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search shops... (AI-powered)"
          value={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-9 pr-10"
        />
        {searching && (
          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-pulse" />
        )}
      </div>

      {/* AI search results */}
      {searchQuery.trim().length >= 2 && aiResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
            Matching shops
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {aiResults.map(name => (
              <StoreChip
                key={name}
                name={name}
                onAddCode={() => selectStoreForCode(name)}
                onAddPhoto={() => selectStoreForPhoto(name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recently Used Stores */}
      {!searchQuery && recentStores.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recently Used</p>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {recentStores.slice(0, 5).map(name => (
              <StoreChip
                key={name}
                name={name}
                onAddCode={() => selectStoreForCode(name)}
                onAddPhoto={() => selectStoreForPhoto(name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Saved Codes */}
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading...</div>
      ) : filteredCodes.length === 0 && codes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Tag className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No discount codes yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Search for a shop above or add a code</p>
        </div>
      ) : filteredCodes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No codes match "{searchQuery}"</p>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">
            Your Saved Codes ({filteredCodes.length})
          </h2>
          {Object.entries(filteredGrouped).map(([store, storeCodes]) => (
            <div key={store} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Store className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{store}</h3>
                <span className="text-[10px] text-muted-foreground">({storeCodes.length})</span>
                {findStoreInfo(store) && (
                  <button onClick={() => setStoreInfoModal(findStoreInfo(store)!)} className="text-muted-foreground hover:text-foreground">
                    <Info className="w-3 h-3" />
                  </button>
                )}
              </div>
              {storeCodes.map(item => (
                <Card key={item.id} className={`border-border/50 overflow-hidden ${isExpired(item.expiry_date) ? 'opacity-50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {item.receipt_image_url && signedUrls[item.id] && (
                        <button
                          onClick={() => setPreviewImage(signedUrls[item.id])}
                          className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border bg-muted"
                        >
                          <img src={signedUrls[item.id]} alt="Receipt" className="w-full h-full object-cover" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.code !== 'RECEIPT' && (
                            <button
                              onClick={() => copyCode(item.code)}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                            >
                              <Tag className="w-3 h-3 text-primary" />
                              <span className="font-mono font-bold text-sm text-primary">{item.code}</span>
                              <Copy className="w-3 h-3 text-primary/60" />
                            </button>
                          )}
                          {item.code === 'RECEIPT' && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Camera className="w-3 h-3" /> Receipt photo
                            </span>
                          )}
                          {isExpired(item.expiry_date) && (
                            <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Expired</span>
                          )}
                        </div>
                        {item.description && item.code !== 'RECEIPT' && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>
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
                      <Button
                        variant="ghost" size="icon"
                        className="shrink-0 h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteCode(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Browse Shops by Region */}
      <div className="space-y-2">
        <button
          onClick={() => setBrowseMode(!browseMode)}
          className="flex items-center gap-2 px-1 w-full"
        >
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Browse Shops by Region
          </h2>
          {browseMode ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        {browseMode && STORE_REGIONS.map(region => (
          <div key={region.key} className="border border-border/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleRegion(region.key)}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">{region.emoji}</span>
                <span className="text-sm font-semibold">{region.label}</span>
                <span className="text-[10px] text-muted-foreground">({region.stores.length})</span>
              </span>
              {expandedRegions.has(region.key) ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {expandedRegions.has(region.key) && (
              <div className="px-3 pb-3 space-y-1.5">
                {region.stores.map(store => (
                  <div key={store.name} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{store.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{store.couponType}</span>
                    </div>
                    <button onClick={() => setStoreInfoModal(store)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => selectStoreForCode(store.name)}
                      className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3 h-3 text-primary" />
                    </button>
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
          <DialogHeader>
            <DialogTitle>Add Discount Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Store</label>
              <Input
                placeholder="Store name"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
              />
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

      {/* Add Photo Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Receipt Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Store</label>
              <Input
                placeholder="Store name"
                value={photoStoreName}
                onChange={e => setPhotoStoreName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Receipt Photo</label>
              {capturedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={capturedImage} alt="Receipt" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={() => { setCapturedImage(null); setCapturedFile(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expiry Date (optional)</label>
              <Input type="date" value={photoExpiryDate} onChange={e => setPhotoExpiryDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handlePhotoSubmit} disabled={uploading || !capturedFile}>
              {uploading ? 'Uploading...' : 'Save Receipt'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Store Info Modal */}
      <Dialog open={!!storeInfoModal} onOpenChange={() => setStoreInfoModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              {storeInfoModal?.name}
            </DialogTitle>
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
              <Button
                className="w-full"
                onClick={() => { selectStoreForCode(storeInfoModal.name); setStoreInfoModal(null); }}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Code for {storeInfoModal.name}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-screen image preview */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img src={previewImage} alt="Receipt" className="max-w-full max-h-[85vh] rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
