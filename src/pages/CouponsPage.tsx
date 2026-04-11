import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Camera, Tag, Store, Copy, Calendar, Image as ImageIcon, X } from 'lucide-react';
import { format, isBefore } from 'date-fns';

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

const IRISH_STORES = [
  'Tesco', 'Dunnes Stores', 'SuperValu', 'Aldi', 'Lidl',
  'Centra', 'Spar', 'Supervalu', 'M&S Food', 'Iceland',
  'Dealz', 'EuroSpar', 'Londis', 'Mace',
];

const AMERICAN_STORES = [
  'Walmart', 'Target', 'Costco', 'Kroger', 'Whole Foods',
  "Trader Joe's", 'Publix', 'Safeway', "Sam's Club",
  'Meijer', 'H-E-B', 'Wegmans', 'Aldi', 'Lidl',
];

export default function CouponsPage() {
  const { user } = useAuth();
  const { household, members } = useHousehold();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Code form state
  const [storeName, setStoreName] = useState('');
  const [customStore, setCustomStore] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);

  // Photo form state
  const [photoStoreName, setPhotoStoreName] = useState('');
  const [photoCustomStore, setPhotoCustomStore] = useState('');
  const [photoExpiryDate, setPhotoExpiryDate] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map(
    members.map(m => [m.user_id, m.profile?.display_name || 'Unknown'])
  );

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
      // Resolve signed URLs for receipt images
      const urls: Record<string, string> = {};
      await Promise.all((data || []).filter(d => d.receipt_image_url).map(async (d) => {
        urls[d.id] = await getSignedUrl(d.receipt_image_url!);
      }));
      setSignedUrls(urls);
    }
    setLoading(false);
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
    if (error) {
      toast.error('Failed to upload image');
      return null;
    }
    // Store just the path; we'll create signed URLs for display
    return filePath;
  };

  const getSignedUrl = async (filePath: string): Promise<string> => {
    // If it's already a full URL (legacy data), return as-is
    if (filePath.startsWith('http')) return filePath;
    const { data } = await supabase.storage.from('receipt-images').createSignedUrl(filePath, 3600);
    return data?.signedUrl || '';
  };

  const handleCodeSubmit = async () => {
    if (!household || !user) return;
    const finalStore = storeName === 'Other' ? customStore : storeName;
    if (!finalStore.trim() || !code.trim()) {
      toast.error('Store and code are required');
      return;
    }
    setUploading(true);
    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id,
      store_name: finalStore.trim(),
      code: code.trim(),
      description: description.trim() || null,
      receipt_image_url: null,
      expiry_date: expiryDate || null,
      added_by: user.id,
    });
    if (error) {
      toast.error('Failed to save discount code');
    } else {
      toast.success(`Code for ${finalStore} saved!`);
      resetCodeForm();
      setCodeDialogOpen(false);
      fetchCodes();
    }
    setUploading(false);
  };

  const handlePhotoSubmit = async () => {
    if (!household || !user || !capturedFile) {
      toast.error('Please take or upload a photo');
      return;
    }
    const finalStore = photoStoreName === 'Other' ? photoCustomStore : photoStoreName;
    if (!finalStore.trim()) {
      toast.error('Please select a store');
      return;
    }
    setUploading(true);
    const imageUrl = await uploadReceiptImage(capturedFile);
    if (!imageUrl) { setUploading(false); return; }

    const { error } = await supabase.from('discount_codes').insert({
      household_id: household.id,
      store_name: finalStore.trim(),
      code: 'RECEIPT',
      description: 'Receipt photo',
      receipt_image_url: imageUrl,
      expiry_date: photoExpiryDate || null,
      added_by: user.id,
    });
    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success(`Receipt for ${finalStore} saved!`);
      resetPhotoForm();
      setPhotoDialogOpen(false);
      fetchCodes();
    }
    setUploading(false);
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('discount_codes').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setCodes(prev => prev.filter(c => c.id !== id));
      toast.success('Deleted');
    }
  };

  const copyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    toast.success('Code copied!');
  };

  const resetCodeForm = () => {
    setStoreName(''); setCustomStore(''); setCode(''); setDescription(''); setExpiryDate('');
  };

  const resetPhotoForm = () => {
    setPhotoStoreName(''); setPhotoCustomStore(''); setPhotoExpiryDate('');
    setCapturedImage(null); setCapturedFile(null);
  };

  const isExpired = (date: string | null) => date ? isBefore(new Date(date), new Date()) : false;

  const grouped = codes.reduce<Record<string, DiscountCode[]>>((acc, c) => {
    (acc[c.store_name] = acc[c.store_name] || []).push(c);
    return acc;
  }, {});

  const StoreSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select a store" /></SelectTrigger>
      <SelectContent>
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Irish Stores</div>
        {IRISH_STORES.map(s => <SelectItem key={`ie-${s}`} value={s}>{s}</SelectItem>)}
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">American Stores</div>
        {AMERICAN_STORES.map(s => <SelectItem key={`us-${s}`} value={s}>{s}</SelectItem>)}
        <div className="border-t border-border mt-1 pt-1">
          <SelectItem value="Other">Other</SelectItem>
        </div>
      </SelectContent>
    </Select>
  );

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">Coupons & Deals</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Save & share discount codes</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { resetPhotoForm(); setPhotoDialogOpen(true); }} className="gap-1.5">
            <Camera className="w-4 h-4" />
            Photo
          </Button>
          <Button size="sm" onClick={() => { resetCodeForm(); setCodeDialogOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Code
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading...</div>
      ) : codes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Tag className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No discount codes yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Add a coupon code or snap a receipt photo</p>
        </div>
      ) : (
        Object.entries(grouped).map(([store, storeCodes]) => (
          <div key={store} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Store className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{store}</h3>
              <span className="text-[10px] text-muted-foreground">({storeCodes.length})</span>
            </div>
            {storeCodes.map(item => (
              <Card key={item.id} className={`border-border/50 overflow-hidden ${isExpired(item.expiry_date) ? 'opacity-50' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {item.receipt_image_url && (
                      <button
                        onClick={() => setPreviewImage(item.receipt_image_url)}
                        className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border bg-muted"
                      >
                        <img src={item.receipt_image_url} alt="Receipt" className="w-full h-full object-cover" />
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
                      variant="ghost"
                      size="icon"
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
        ))
      )}

      {/* Add Code Dialog */}
      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Discount Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Store</label>
              <StoreSelect value={storeName} onChange={setStoreName} />
              {storeName === 'Other' && (
                <Input placeholder="Enter store name" value={customStore} onChange={e => setCustomStore(e.target.value)} className="mt-2" />
              )}
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
              <StoreSelect value={photoStoreName} onChange={setPhotoStoreName} />
              {photoStoreName === 'Other' && (
                <Input placeholder="Enter store name" value={photoCustomStore} onChange={e => setPhotoCustomStore(e.target.value)} className="mt-2" />
              )}
            </div>

            {/* Photo capture */}
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
