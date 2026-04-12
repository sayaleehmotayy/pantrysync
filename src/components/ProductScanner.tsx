import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, RotateCcw, Check, Loader2, X, SwitchCamera, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CATEGORIES = ['Fruits', 'Vegetables', 'Dairy', 'Grains', 'Snacks', 'Drinks', 'Meat', 'Spices', 'Frozen', 'Sauces', 'Other'];
const UNITS = ['pieces', 'g', 'kg', 'ml', 'l', 'cups', 'tbsp', 'tsp', 'bottles', 'packets'];
const LOCATIONS = ['pantry', 'fridge', 'freezer'];

interface ScannedProduct {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  storage_location: string;
  brand: string | null;
  barcode: string | null;
  ingredients: string | null;
  nutritional_info: string | null;
  confidence: number;
}

interface ProductScannerProps {
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
}

export default function ProductScanner({ open, onOpenChange, onAddToPantry }: ProductScannerProps) {
  const [step, setStep] = useState<'capture' | 'analyzing' | 'review'>('capture');
  const [images, setImages] = useState<string[]>([]);
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [editedProduct, setEditedProduct] = useState<ScannedProduct | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      toast.error('Unable to access camera. Please use the upload option instead.');
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setImages(prev => [...prev, dataUrl]);
    toast.success(`Photo ${images.length + 1} captured`);
  }, [images.length]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const analyzeImages = async () => {
    if (images.length === 0) {
      toast.error('Please capture or upload at least one photo');
      return;
    }

    stopCamera();
    setStep('analyzing');

    try {
      const { data, error } = await supabase.functions.invoke('scan-product', {
        body: { images },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const scanned = data.product as ScannedProduct;
      setProduct(scanned);
      setEditedProduct({ ...scanned });
      setStep('review');
    } catch (e: any) {
      toast.error(e.message || 'Failed to analyze product');
      setStep('capture');
    }
  };

  const handleConfirmAdd = () => {
    if (!editedProduct) return;
    onAddToPantry({
      name: editedProduct.name,
      quantity: editedProduct.quantity,
      unit: editedProduct.unit,
      category: editedProduct.category,
      expiry_date: editedProduct.expiry_date,
      storage_location: editedProduct.storage_location,
      min_threshold: 0,
    });
    handleClose();
  };

  const handleClose = () => {
    stopCamera();
    setStep('capture');
    setImages([]);
    setProduct(null);
    setEditedProduct(null);
    onOpenChange(false);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Start camera when dialog opens
  React.useEffect(() => {
    if (open && step === 'capture') {
      startCamera();
    }
    return () => { if (!open) stopCamera(); };
  }, [open, step, startCamera, stopCamera]);

  // Restart camera when facing mode changes
  React.useEffect(() => {
    if (cameraActive) {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh]">
        {step === 'capture' && (
          <div className="flex flex-col">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" /> Scan Product
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Take photos of the front, back, or barcode</p>
            </DialogHeader>

            {/* Camera viewfinder */}
            <div className="relative bg-black aspect-[3/4] max-h-[300px] overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Camera overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-8 border-2 border-white/30 rounded-2xl" />
              </div>
              {/* Camera controls */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-white/20 backdrop-blur-sm"
                  onClick={toggleCamera}
                >
                  <SwitchCamera className="w-5 h-5 text-white" />
                </Button>
                <Button
                  size="icon"
                  className="rounded-full w-14 h-14 bg-white shadow-lg hover:bg-white/90"
                  onClick={capturePhoto}
                >
                  <div className="w-10 h-10 rounded-full border-[3px] border-primary" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full w-10 h-10 bg-white/20 backdrop-blur-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="w-5 h-5 text-white" />
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Captured images preview */}
            {images.length > 0 && (
              <div className="p-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">
                  {images.length} photo{images.length > 1 ? 's' : ''} captured
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border">
                      <img src={img} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-0 right-0 w-5 h-5 bg-destructive text-white rounded-bl-md flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 pt-2 space-y-2">
              <Button
                className="w-full"
                onClick={analyzeImages}
                disabled={images.length === 0}
              >
                <Camera className="w-4 h-4 mr-2" />
                Analyze {images.length > 0 ? `${images.length} Photo${images.length > 1 ? 's' : ''}` : 'Product'}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Tip: Capture front (name), back (ingredients/nutrition), and barcode for best results
              </p>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <h3 className="font-display font-semibold text-lg">Analyzing Product</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              AI is reading labels, barcodes, and nutritional info...
            </p>
          </div>
        )}

        {step === 'review' && editedProduct && (
          <div className="flex flex-col max-h-[85vh] overflow-y-auto">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" /> Product Details
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${product!.confidence > 0.8 ? 'bg-primary' : product!.confidence > 0.5 ? 'bg-warning' : 'bg-destructive'}`} />
                <span className="text-xs text-muted-foreground">
                  {Math.round(product!.confidence * 100)}% confidence — review and edit if needed
                </span>
              </div>
            </DialogHeader>

            <div className="p-4 pt-2 space-y-3">
              {/* Captured images thumbnail strip */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <div key={i} className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-border">
                    <img src={img} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              {/* Editable fields */}
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
                  onChange={e => setEditedProduct({ ...editedProduct, expiry_date: e.target.value || null })}
                />
              </div>

              {/* Extra info display */}
              {(editedProduct.brand || editedProduct.barcode || editedProduct.ingredients || editedProduct.nutritional_info) && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Additional Info</p>
                  {editedProduct.brand && (
                    <p className="text-xs"><span className="text-muted-foreground">Brand:</span> {editedProduct.brand}</p>
                  )}
                  {editedProduct.barcode && (
                    <p className="text-xs"><span className="text-muted-foreground">Barcode:</span> {editedProduct.barcode}</p>
                  )}
                  {editedProduct.ingredients && (
                    <p className="text-xs"><span className="text-muted-foreground">Ingredients:</span> {editedProduct.ingredients}</p>
                  )}
                  {editedProduct.nutritional_info && (
                    <p className="text-xs"><span className="text-muted-foreground">Nutrition:</span> {editedProduct.nutritional_info}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStep('capture'); setProduct(null); setEditedProduct(null); }}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Rescan
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
