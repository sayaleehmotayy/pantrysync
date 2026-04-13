import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useReceiptScanner, ReceiptItem } from '@/hooks/useReceiptScanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Camera, Receipt, ShoppingBasket, BarChart3, Loader2, ArrowLeft, Store, Calendar, DollarSign, Tag, ImagePlus, RotateCcw, X, SwitchCamera, ChevronRight, Info, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

const CHART_COLORS = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC', '#1B4332', '#081C15', '#A7C957'];

type Tab = 'scan' | 'history' | 'analytics';
type CaptureStep = 'idle' | 'capture' | 'review';

function compressImage(dataUrl: string, maxWidth = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function getCurrencySymbol(currency: string) {
  return currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency + ' ';
}

// Processing progress card with estimated time
function ProcessingCard({ photoCount, onCheckHistory }: { photoCount: number; onCheckHistory: () => void }) {
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const estimatedMs = Math.max(photoCount * 8000, 8000);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 500);
    return () => clearInterval(timer);
  }, [startTime]);

  const rawProgress = Math.min((elapsed / estimatedMs) * 100, 95);
  const progress = Math.round(rawProgress < 80 ? rawProgress : 80 + (rawProgress - 80) * 0.5);
  const remainingSec = Math.max(0, Math.round((estimatedMs - elapsed) / 1000));
  const timeLabel = remainingSec > 60
    ? `~${Math.ceil(remainingSec / 60)} min left`
    : remainingSec > 0 ? `~${remainingSec}s left` : 'Almost done...';

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="font-display font-semibold">Processing {photoCount} photo{photoCount > 1 ? 's' : ''}...</p>
        <div className="w-full max-w-xs space-y-1.5 mt-1">
          <Progress value={progress} className="h-2.5" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress}%</span>
            <span>{timeLabel}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-xs mt-1">
          Runs in the background — feel free to use other features.
        </p>
        <Button variant="outline" size="sm" className="mt-1" onClick={onCheckHistory}>
          Check History
        </Button>
      </CardContent>
    </Card>
  );
}

// Detail view for a single receipt from history
function ReceiptDetailView({ scan, onBack }: { scan: any; onBack: () => void }) {
  const result = scan.processing_result as any;
  const items = result?.items || [];
  const couponCodes = result?.coupon_codes || [];
  const sym = getCurrencySymbol(scan.currency || 'USD');

  return (
    <div className="space-y-3 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>

      {/* Header */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-bold flex items-center gap-1.5">
                <Store className="w-4 h-4 text-primary" /> {scan.store_name || 'Unknown Store'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {scan.receipt_date
                    ? format(new Date(scan.receipt_date), 'MMM d, yyyy')
                    : format(new Date(scan.created_at), 'MMM d, yyyy')}
                </p>
                {scan.photo_count > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {scan.photo_count} photo{scan.photo_count > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
            {scan.total_amount != null && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-primary">{sym}{Number(scan.total_amount).toFixed(2)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Coupon info banner */}
      {couponCodes.length > 0 && (
        <Card className="border-primary/20 bg-accent/30">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {couponCodes.length} coupon{couponCodes.length > 1 ? 's' : ''} found on this receipt
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically added to your Coupons section{scan.store_name ? ` under ${scan.store_name}` : ''}.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {couponCodes.map((c: any, i: number) => (
                    <Badge key={i} variant="default" className="font-mono text-xs">{c.code}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items list — digital receipt */}
      <div className="px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Items ({items.length})
        </h3>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <Receipt className="w-6 h-6 mb-2" />
          <p className="text-sm">No item details available for this receipt.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                  <Badge variant="outline" className="text-[10px] h-4">{item.category}</Badge>
                </div>
              </div>
              {item.total_price != null && (
                <p className="text-sm font-semibold shrink-0 ml-2">{sym}{Number(item.total_price).toFixed(2)}</p>
              )}
            </div>
          ))}
          {/* Total line */}
          {scan.total_amount != null && (
            <div className="flex items-center justify-between py-3 px-3 border-t border-border mt-1">
              <p className="text-sm font-bold">Total</p>
              <p className="text-sm font-bold text-primary">{sym}{Number(scan.total_amount).toFixed(2)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReceiptScannerPage() {
  const {
    scanStatus, photoCount, errorMessage,
    items, setItems, coupons,
    storeName, receiptDate, totalAmount, currency,
    submitPhotos, addSelectedToPantry, resetScan,
    history, analytics, isLoadingHistory,
  } = useReceiptScanner();

  const [tab, setTab] = useState<Tab>('scan');
  const [captureStep, setCaptureStep] = useState<CaptureStep>('idle');
  const [images, setImages] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [selectedScan, setSelectedScan] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When scan completes in background, go to review
  useEffect(() => {
    if (scanStatus === 'completed') setCaptureStep('review');
    if (scanStatus === 'failed') setCaptureStep('idle');
  }, [scanStatus]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      toast.error('Unable to access camera. Use the upload button instead.');
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0);
    setImages(prev => [...prev, canvas.toDataURL('image/jpeg', 0.85)]);
    toast.success(`Photo ${images.length + 1} captured`);
  }, [images.length]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index));

  const toggleCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  useEffect(() => {
    if (captureStep === 'capture') startCamera();
    return () => { if (captureStep !== 'capture') stopCamera(); };
  }, [captureStep, startCamera, stopCamera]);

  useEffect(() => {
    if (captureStep === 'capture' && cameraActive) { stopCamera(); startCamera(); }
  }, [facingMode]);

  const processAllPhotos = async () => {
    if (images.length === 0) { toast.error('Take at least one photo'); return; }
    stopCamera();
    try {
      const compressed = await Promise.all(images.map(img => compressImage(img)));
      await submitPhotos(compressed);
    } catch {}
  };

  const handleStartCapture = () => { setImages([]); setCaptureStep('capture'); };

  const handleAddToPantry = async () => {
    setAdding(true);
    await addSelectedToPantry(items);
    setAdding(false);
    resetScan();
    setImages([]);
    setCaptureStep('idle');
    setTab('scan');
  };

  const handleDone = () => {
    resetScan();
    setImages([]);
    setCaptureStep('idle');
    setTab('scan');
  };

  const handleCancel = () => {
    stopCamera();
    resetScan();
    setImages([]);
    setCaptureStep('idle');
  };

  const toggleItem = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const selectedCount = items.filter(i => i.selected !== false).length;
  const currencySymbol = getCurrencySymbol(currency);
  const isProcessing = scanStatus === 'processing' || scanStatus === 'uploading';
  const processingCount = history.filter((s: any) => s.status === 'processing' || s.status === 'pending').length;

  // If viewing a receipt detail
  if (selectedScan) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" /> Digital Receipt
          </h1>
        </div>
        <ReceiptDetailView scan={selectedScan} onBack={() => setSelectedScan(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" /> Receipt Scanner
        </h1>
        <Badge variant="default" className="bg-primary/10 text-primary text-[10px]">PRO</Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {([
          { key: 'scan', label: 'Scan', icon: Camera },
          { key: 'history', label: 'History', icon: Receipt },
          { key: 'analytics', label: 'Insights', icon: BarChart3 },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.key === 'scan' && isProcessing && (
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
            {t.key === 'history' && processingCount > 0 && (
              <span className="min-w-[18px] h-[18px] bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                {processingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Scan Tab */}
      {tab === 'scan' && (
        <>
          {/* IDLE */}
          {captureStep === 'idle' && !isProcessing && (
            <Card className="border-dashed border-2 border-primary/30">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-display font-semibold">Scan a Receipt</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Take multiple photos of your receipt, then we'll extract all items in the background — even if you leave the app.
                  </p>
                </div>
                {errorMessage && (
                  <div className="w-full max-w-xs bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                    <p className="text-sm text-destructive">{errorMessage}</p>
                  </div>
                )}
                <Button onClick={handleStartCapture} className="gap-2">
                  <Camera className="w-4 h-4" /> Start Scanning
                </Button>
              </CardContent>
            </Card>
          )}

          {/* PROCESSING — background */}
          {isProcessing && captureStep !== 'capture' && (
            <ProcessingCard photoCount={photoCount} onCheckHistory={() => setTab('history')} />
          )}

          {/* CAPTURE — Camera */}
          {captureStep === 'capture' && !isProcessing && (
            <div className="space-y-3">
              <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4] max-h-[350px]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-6 border-2 border-white/20 rounded-xl" />
                  <div className="absolute top-3 left-0 right-0 text-center">
                    <span className="text-white/80 text-xs bg-black/40 px-3 py-1 rounded-full">Align receipt in frame</span>
                  </div>
                </div>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-6">
                  <Button variant="secondary" size="icon" className="rounded-full w-10 h-10 bg-white/20 backdrop-blur-sm" onClick={toggleCamera}>
                    <SwitchCamera className="w-5 h-5 text-white" />
                  </Button>
                  <Button size="icon" className="rounded-full w-16 h-16 bg-white shadow-lg hover:bg-white/90" onClick={capturePhoto}>
                    <div className="w-12 h-12 rounded-full border-[3px] border-primary" />
                  </Button>
                  <Button variant="secondary" size="icon" className="rounded-full w-10 h-10 bg-white/20 backdrop-blur-sm" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="w-5 h-5 text-white" />
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
              </div>

              {images.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {images.length} photo{images.length > 1 ? 's' : ''} — keep snapping for long receipts
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((img, i) => (
                      <div key={i} className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-border">
                        <img src={img} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => removeImage(i)} className="absolute top-0 right-0 w-5 h-5 bg-destructive text-white rounded-bl-md flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCancel}>Cancel</Button>
                <Button className="flex-1 gap-2" onClick={processAllPhotos} disabled={images.length === 0}>
                  <Receipt className="w-4 h-4" />
                  Process {images.length > 0 ? `${images.length} Photo${images.length > 1 ? 's' : ''}` : 'Receipt'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Tip: For long receipts, take overlapping photos from top to bottom.
              </p>
            </div>
          )}

          {/* REVIEW — results */}
          {captureStep === 'review' && scanStatus === 'completed' && (
            <div className="space-y-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {storeName && (
                        <p className="font-display font-bold flex items-center gap-1.5">
                          <Store className="w-4 h-4 text-primary" /> {storeName}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-0.5">
                        {receiptDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {format(new Date(receiptDate), 'MMM d, yyyy')}
                          </p>
                        )}
                        <Badge variant="outline" className="text-[10px] h-4">
                          {photoCount} photo{photoCount > 1 ? 's' : ''} scanned
                        </Badge>
                      </div>
                    </div>
                    {totalAmount != null && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold text-primary">{currencySymbol}{totalAmount.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {coupons.length > 0 && (
                <Card className="border-primary/20 bg-accent/30">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">
                          {coupons.length} coupon{coupons.length > 1 ? 's' : ''} found!
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Added to your Coupons section{storeName ? ` under ${storeName}` : ''}.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {coupons.map((coupon, idx) => (
                            <Badge key={idx} variant="default" className="font-mono text-xs">{coupon.code}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Items Found ({items.length})
                </h3>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => setItems(prev => prev.map(i => ({ ...i, selected: !prev.every(p => p.selected !== false) })))}
                >
                  {items.every(i => i.selected !== false) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
                  <p className="text-sm">No items were extracted. Try scanning again.</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={handleStartCapture}>
                    <RotateCcw className="w-3.5 h-3.5" /> Rescan
                  </Button>
                </div>
              ) : (
                items.map((item, idx) => (
                  <Card key={idx} className={`border-border/50 shadow-none transition-opacity ${item.selected === false ? 'opacity-50' : ''}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox checked={item.selected !== false} onCheckedChange={() => toggleItem(idx)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                            <Badge variant="outline" className="text-[10px] h-4">{item.category}</Badge>
                          </div>
                        </div>
                        {item.total_price != null && (
                          <p className="text-sm font-semibold shrink-0">{currencySymbol}{item.total_price.toFixed(2)}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              <div className="flex gap-2 sticky bottom-20 md:bottom-4 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4">
                <Button variant="outline" className="flex-1" onClick={handleDone}>
                  Done
                </Button>
                <Button className="flex-1 gap-2" onClick={handleAddToPantry} disabled={adding || selectedCount === 0}>
                  <ShoppingBasket className="w-4 h-4" />
                  {adding ? 'Adding...' : `Add ${selectedCount} to Pantry`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No receipts scanned yet</p>
            </div>
          ) : (
            history.map((scan: any) => {
              const isActive = scan.status === 'processing' || scan.status === 'pending';
              const isFailed = scan.status === 'failed';
              const isCompleted = scan.status === 'completed';
              const sym = getCurrencySymbol(scan.currency || 'USD');
              const couponCount = (scan.processing_result as any)?.coupon_codes?.length || 0;

              return (
                <Card
                  key={scan.id}
                  className={`border-border/50 shadow-none transition-all ${isCompleted ? 'cursor-pointer hover:border-primary/30 active:scale-[0.99]' : ''} ${isActive ? 'border-primary/30 bg-primary/5' : ''}`}
                  onClick={() => isCompleted && setSelectedScan(scan)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm flex items-center gap-2">
                          {scan.store_name || 'Unknown Store'}
                          {isActive && (
                            <Badge variant="outline" className="text-[10px] h-4 text-primary border-primary/30">
                              <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />Processing
                            </Badge>
                          )}
                          {isFailed && (
                            <Badge variant="destructive" className="text-[10px] h-4">Failed</Badge>
                          )}
                          {isCompleted && couponCount > 0 && (
                            <Badge variant="outline" className="text-[10px] h-4 text-primary border-primary/30">
                              <Tag className="w-2.5 h-2.5 mr-0.5" />{couponCount}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {scan.receipt_date
                            ? format(new Date(scan.receipt_date), 'MMM d, yyyy')
                            : format(new Date(scan.created_at), 'MMM d, yyyy')}
                        </p>

                        {/* Processing progress bar in history */}
                        {isActive && (
                          <HistoryProcessingBar scan={scan} />
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {isCompleted && scan.total_amount != null && (
                          <p className="font-bold text-sm">{sym}{Number(scan.total_amount).toFixed(2)}</p>
                        )}
                        {isCompleted && (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <div className="space-y-4">
          {!analytics || analytics.totalReceipts === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Scan some receipts to see spending insights</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <DollarSign className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">${analytics.totalSpent.toFixed(0)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Spent</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <Receipt className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">{analytics.totalReceipts}</p>
                    <p className="text-[10px] text-muted-foreground">Receipts</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3 text-center">
                    <ShoppingBasket className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-lg font-bold">{analytics.totalItems}</p>
                    <p className="text-[10px] text-muted-foreground">Items</p>
                  </CardContent>
                </Card>
              </div>

              {Object.keys(analytics.categorySpending).length > 0 && (
                <Card className="border-border/50 shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Spending by Category</CardTitle></CardHeader>
                  <CardContent className="p-3">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={Object.entries(analytics.categorySpending).map(([name, value]) => ({ name, value }))} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {Object.keys(analytics.categorySpending).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {Object.keys(analytics.storeSpending).length > 0 && (
                <Card className="border-border/50 shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Spending by Store</CardTitle></CardHeader>
                  <CardContent className="p-3">
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.entries(analytics.storeSpending).map(([name, value]) => ({ name, value }))}>
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Mini progress bar for processing receipts shown in history list
function HistoryProcessingBar({ scan }: { scan: any }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const photoCount = scan.photo_count || 1;
  const estimatedMs = Math.max(photoCount * 8000, 8000);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startRef.current), 500);
    return () => clearInterval(timer);
  }, []);

  const rawProgress = Math.min((elapsed / estimatedMs) * 100, 95);
  const progress = Math.round(rawProgress < 80 ? rawProgress : 80 + (rawProgress - 80) * 0.5);
  const remainingSec = Math.max(0, Math.round((estimatedMs - elapsed) / 1000));
  const timeLabel = remainingSec > 60
    ? `~${Math.ceil(remainingSec / 60)} min`
    : remainingSec > 0 ? `~${remainingSec}s` : 'Almost done';

  return (
    <div className="mt-2 space-y-1">
      <Progress value={progress} className="h-1.5" />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{progress}%</span>
        <span>{timeLabel}</span>
      </div>
    </div>
  );
}
