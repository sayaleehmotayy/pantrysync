import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScanBarcode, Loader2, Check, RotateCcw, Keyboard, X, SwitchCamera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Frozen', 'Sauces', 'Other'];
const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp', 'bottles', 'packets'];
const LOCATIONS = ['pantry', 'fridge', 'freezer'];

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToPantry: (item: {
    name: string;
    quantity: number;
    unit: string;
    category: string;
    expiry_date?: string | null;
    storage_location?: string;
    min_threshold?: number;
  }) => void;
  onAddToShoppingList?: (item: {
    name: string;
    quantity: number;
    unit: string;
    category: string;
  }) => void;
  defaultDestination?: 'pantry' | 'shopping';
}

interface ProductResult {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  storage_location: string;
  brand: string | null;
  barcode: string;
  image_url: string | null;
  ingredients: string | null;
  nutritional_info: string | null;
}

export default function BarcodeScanner({ open, onOpenChange, onAddToPantry, onAddToShoppingList, defaultDestination = 'shopping' }: BarcodeScannerProps) {
  const [step, setStep] = useState<'scan' | 'manual' | 'looking' | 'review' | 'not_found'>('scan');
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [editedProduct, setEditedProduct] = useState<ProductResult & { expiry_date: string }>({} as any);
  const [manualBarcode, setManualBarcode] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [destination, setDestination] = useState<'pantry' | 'shopping'>(defaultDestination);
  const [source, setSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScannedRef = useRef('');

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const lookupBarcode = useCallback(async (barcode: string) => {
    if (!barcode) return;
    lastScannedRef.current = barcode;
    stopCamera();
    setStep('looking');

    try {
      const { data, error } = await supabase.functions.invoke('lookup-barcode', {
        body: { barcode },
      });

      if (error) throw error;

      if (data?.found && data.product) {
        setProduct(data.product);
        setEditedProduct({ ...data.product, expiry_date: '' });
        setStep('review');
        toast.success('Product found!');
      } else {
        setStep('not_found');
      }
    } catch (e: any) {
      toast.error(e.message || 'Lookup failed');
      setStep('scan');
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Use BarcodeDetector if available (Chrome, Edge, Android WebView)
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              if (code && code !== lastScannedRef.current) {
                lookupBarcode(code);
              }
            }
          } catch {
            // detection frame error — ignore
          }
        }, 300);
      }
    } catch {
      toast.error('Unable to access camera. Use manual entry instead.');
      setStep('manual');
    }
  }, [facingMode, lookupBarcode]);

  useEffect(() => {
    if (open && step === 'scan') {
      lastScannedRef.current = '';
      startCamera();
    }
    return () => {
      if (!open) stopCamera();
    };
  }, [open, step, startCamera, stopCamera]);

  const handleClose = () => {
    stopCamera();
    setStep('scan');
    setProduct(null);
    setManualBarcode('');
    lastScannedRef.current = '';
    onOpenChange(false);
  };

  const handleConfirmAdd = () => {
    if (!editedProduct) return;
    onAddToPantry({
      name: editedProduct.name,
      quantity: editedProduct.quantity,
      unit: editedProduct.unit,
      category: editedProduct.category,
      expiry_date: editedProduct.expiry_date || null,
      storage_location: editedProduct.storage_location,
      min_threshold: 0,
    });
    handleClose();
  };

  const handleRescan = () => {
    setProduct(null);
    setManualBarcode('');
    lastScannedRef.current = '';
    setStep('scan');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh]">
        {/* SCAN STEP */}
        {step === 'scan' && (
          <div className="flex flex-col">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <ScanBarcode className="w-5 h-5 text-primary" /> Scan Barcode
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Point your camera at a product barcode
              </p>
            </DialogHeader>

            <div className="relative bg-black aspect-[4/3] max-h-[280px] overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Scan guide overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[70%] h-24 border-2 border-primary/60 rounded-xl relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-primary rounded-br-lg" />
                  {/* Scanning line animation */}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-primary/50 animate-pulse" />
                </div>
              </div>
              {/* Camera flip */}
              <div className="absolute bottom-3 right-3">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full w-9 h-9 bg-white/20 backdrop-blur-sm"
                  onClick={() => {
                    stopCamera();
                    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
                  }}
                >
                  <SwitchCamera className="w-4 h-4 text-white" />
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {!('BarcodeDetector' in window) && (
                <p className="text-xs text-warning text-center">
                  Auto-detection not supported in this browser. Enter barcode manually below.
                </p>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { stopCamera(); setStep('manual'); }}
              >
                <Keyboard className="w-4 h-4" /> Enter barcode manually
              </Button>
            </div>
          </div>
        )}

        {/* MANUAL ENTRY */}
        {step === 'manual' && (
          <div className="flex flex-col p-4">
            <DialogHeader className="pb-3">
              <DialogTitle className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-primary" /> Enter Barcode
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="e.g. 5901234123457"
                value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoFocus
                maxLength={14}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStep('scan'); }}>
                  Back to camera
                </Button>
                <Button
                  className="flex-1"
                  disabled={manualBarcode.length < 8}
                  onClick={() => lookupBarcode(manualBarcode)}
                >
                  Look up
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* LOOKING UP */}
        {step === 'looking' && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <h3 className="font-display font-semibold text-lg">Looking up product</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Searching product database...
            </p>
          </div>
        )}

        {/* NOT FOUND */}
        {step === 'not_found' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <X className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display font-semibold text-lg">Product not found</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Barcode <span className="font-mono text-foreground">{lastScannedRef.current}</span> isn't in our database yet.
            </p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleRescan}>
                <RotateCcw className="w-4 h-4 mr-1" /> Scan again
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* REVIEW */}
        {step === 'review' && editedProduct && (
          <div className="flex flex-col max-h-[85vh] overflow-y-auto">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" /> Product Found
              </DialogTitle>
            </DialogHeader>

            <div className="p-4 pt-2 space-y-3">
              {/* Product image if available */}
              {product?.image_url && (
                <div className="flex justify-center">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-24 h-24 object-contain rounded-lg border border-border"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Product Name</label>
                <Input
                  value={editedProduct.name}
                  onChange={e => setEditedProduct({ ...editedProduct, name: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Quantity</label>
                  <Input
                    type="number"
                    value={editedProduct.quantity}
                    onChange={e => setEditedProduct({ ...editedProduct, quantity: Number(e.target.value) })}
                    min="0"
                    step="any"
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                  <Select value={editedProduct.unit} onValueChange={v => setEditedProduct({ ...editedProduct, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <Select value={editedProduct.category} onValueChange={v => setEditedProduct({ ...editedProduct, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Storage</label>
                  <Select value={editedProduct.storage_location} onValueChange={v => setEditedProduct({ ...editedProduct, storage_location: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LOCATIONS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Expiry Date</label>
                <Input
                  type="date"
                  value={editedProduct.expiry_date || ''}
                  onChange={e => setEditedProduct({ ...editedProduct, expiry_date: e.target.value })}
                />
              </div>

              {/* Extra info */}
              {(product?.brand || product?.barcode || product?.ingredients || product?.nutritional_info) && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product Info</p>
                  {product.brand && (
                    <p className="text-xs"><span className="text-muted-foreground">Brand:</span> {product.brand}</p>
                  )}
                  {product.barcode && (
                    <p className="text-xs"><span className="text-muted-foreground">Barcode:</span> {product.barcode}</p>
                  )}
                  {product.ingredients && (
                    <p className="text-xs line-clamp-3"><span className="text-muted-foreground">Ingredients:</span> {product.ingredients}</p>
                  )}
                  {product.nutritional_info && (
                    <p className="text-xs"><span className="text-muted-foreground">Nutrition:</span> {product.nutritional_info}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={handleRescan}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Scan another
                </Button>
                <Button className="flex-1" onClick={handleConfirmAdd}>
                  <Check className="w-4 h-4 mr-1" /> Add to Pantry
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
