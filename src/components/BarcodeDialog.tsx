import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Image as ImageIcon, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';

interface BarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  storeName?: string;
  title?: string | null;
  fallbackImageUrl?: string | null;
}

function detectFormat(code: string): string {
  const digits = code.replace(/\s/g, '');
  if (/^\d{13}$/.test(digits)) return 'EAN13';
  if (/^\d{8}$/.test(digits)) return 'EAN8';
  if (/^\d{12}$/.test(digits)) return 'UPC';
  return 'CODE128';
}

function hasUsableCode(code: string): boolean {
  const value = (code || '').trim();
  return value.length > 0 && value.toUpperCase() !== 'RECEIPT';
}

function normalizeCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.decoding = 'async';
    img.src = src;
  });
}

async function cropBarcodeFromImage(imageUrl: string, code?: string): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);
    const expectedCode = code && hasUsableCode(code) ? normalizeCode(code) : null;

    let cropRect: { x: number; y: number; width: number; height: number } | null = null;

    if (typeof (window as any).BarcodeDetector !== 'undefined') {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const detections = await detector.detect(img);
        if (detections && detections.length > 0) {
          const matched = expectedCode
            ? detections.find((item: any) => normalizeCode(item.rawValue || '') === expectedCode)
            : detections[0];
          const picked = matched || detections[0];
          const box = picked?.boundingBox;
          if (box && box.width > 0 && box.height > 0) {
            const padX = box.width * 0.18;
            const padTop = box.height * 0.25;
            const padBottom = box.height * 0.55;
            cropRect = {
              x: box.x - padX,
              y: box.y - padTop,
              width: box.width + padX * 2,
              height: box.height + padTop + padBottom,
            };
          }
        }
      } catch (err) {
        console.debug('[BarcodeDialog] BarcodeDetector failed, using heuristic crop', err);
      }
    }

    if (!cropRect) {
      // Heuristic: barcodes on receipts/coupons are usually in the lower-middle
      const width = img.naturalWidth * 0.9;
      const height = img.naturalHeight * 0.3;
      cropRect = {
        x: (img.naturalWidth - width) / 2,
        y: img.naturalHeight * 0.58,
        width,
        height,
      };
    }

    const safeX = clamp(cropRect.x, 0, Math.max(0, img.naturalWidth - 1));
    const safeY = clamp(cropRect.y, 0, Math.max(0, img.naturalHeight - 1));
    const safeWidth = clamp(cropRect.width, 1, img.naturalWidth - safeX);
    const safeHeight = clamp(cropRect.height, 1, img.naturalHeight - safeY);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(safeWidth));
    canvas.height = Math.max(1, Math.round(safeHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, safeX, safeY, safeWidth, safeHeight, 0, 0, canvas.width, canvas.height);

    try {
      return canvas.toDataURL('image/png');
    } catch (err) {
      // Canvas tainted (CORS) — caller will fall back to original image
      console.debug('[BarcodeDialog] canvas tainted, cannot export crop', err);
      return null;
    }
  } catch (err) {
    console.debug('[BarcodeDialog] cropBarcodeFromImage failed', err);
    return null;
  }
}

export function BarcodeDialog({ open, onOpenChange, code, storeName, title, fallbackImageUrl }: BarcodeDialogProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [renderError, setRenderError] = useState(false);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const usableCode = useMemo(() => hasUsableCode(code), [code]);

  // Reset transient state every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setRenderError(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [open, code, fallbackImageUrl]);

  // Try to crop the barcode out of the uploaded photo whenever we have one
  useEffect(() => {
    if (!open || !fallbackImageUrl) {
      setCroppedImageUrl(null);
      setCropLoading(false);
      return;
    }

    let cancelled = false;
    setCropLoading(true);
    setCroppedImageUrl(null);

    cropBarcodeFromImage(fallbackImageUrl, code)
      .then((result) => {
        if (!cancelled) setCroppedImageUrl(result);
      })
      .catch(() => {
        if (!cancelled) setCroppedImageUrl(null);
      })
      .finally(() => {
        if (!cancelled) setCropLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fallbackImageUrl, code]);

  // Decide what to show. Priority:
  //   1. Cropped barcode image (best for cashier)
  //   2. Original uploaded photo (zoomable)
  //   3. Generated SVG barcode (only when no image was uploaded)
  const imageToShow = croppedImageUrl || fallbackImageUrl || null;
  const isShowingCroppedImage = !!croppedImageUrl;
  const shouldRenderSvg = open && !cropLoading && !imageToShow && usableCode && !renderError;

  // Render the JsBarcode SVG only when we actually need it
  useEffect(() => {
    if (!shouldRenderSvg) return;
    const el = svgRef.current;
    if (!el) return;

    setRenderError(false);
    const tryRender = (format: string) => {
      JsBarcode(el, code, {
        format,
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 18,
        margin: 12,
        background: '#ffffff',
        lineColor: '#000000',
      });
    };

    try {
      tryRender(detectFormat(code));
    } catch (err1) {
      console.debug('[BarcodeDialog] primary format failed', err1);
      try {
        tryRender('CODE128');
      } catch (err2) {
        console.debug('[BarcodeDialog] CODE128 fallback failed', err2);
        setRenderError(true);
      }
    }
  }, [shouldRenderSvg, code]);

  const copy = () => {
    if (!usableCode) return;
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || zoom <= 1) return;
    setPan({
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-white p-6 pt-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-center text-black">
              {storeName || 'Scan at checkout'}
            </DialogTitle>
            {title && <p className="text-xs text-center text-neutral-600 mt-1">{title}</p>}
          </DialogHeader>

          {cropLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
              <p className="text-sm text-neutral-600">Preparing barcode image…</p>
            </div>
          ) : imageToShow ? (
            <div className="space-y-3">
              <div
                className="relative h-[320px] overflow-hidden rounded-lg bg-neutral-100 touch-none select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  src={imageToShow}
                  alt={isShowingCroppedImage ? 'Cropped barcode from coupon photo' : 'Coupon photo'}
                  className="absolute inset-0 w-full h-full object-contain"
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    cursor: zoom > 1 ? 'grab' : 'default',
                  }}
                />
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setZoom((prev) => {
                      const next = Math.max(1, prev - 0.5);
                      if (next === 1) setPan({ x: 0, y: 0 });
                      return next;
                    });
                  }}
                >
                  <ZoomOut className="w-3.5 h-3.5" /> Out
                </Button>
                <span className="w-10 text-center text-xs font-mono text-neutral-600">{zoom.toFixed(1)}x</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setZoom((prev) => Math.min(5, prev + 0.5))}
                >
                  <ZoomIn className="w-3.5 h-3.5" /> In
                </Button>
              </div>
              <p className="text-[11px] text-center text-neutral-500">
                {isShowingCroppedImage
                  ? 'Barcode cropped from your coupon photo — zoom in if the cashier needs it bigger'
                  : 'Original coupon photo — zoom in on the barcode for the cashier'}
              </p>
            </div>
          ) : shouldRenderSvg ? (
            <div className="flex justify-center bg-white rounded-lg py-2 min-h-[140px]">
              <svg ref={svgRef} className="max-w-full h-auto" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ImageIcon className="w-10 h-10 text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-600 mb-2">No barcode image available for this coupon.</p>
              {usableCode && (
                <p className="font-mono text-base font-bold tracking-wide text-black select-all">{code}</p>
              )}
            </div>
          )}

          <p className="text-[11px] text-center text-neutral-500 mt-3">
            Show this screen to the cashier
          </p>
        </div>

        <div className="bg-background p-3 flex gap-2 border-t">
          {usableCode && (
            <Button variant="outline" className="flex-1 gap-1.5" onClick={copy}>
              <Copy className="w-3.5 h-3.5" /> Copy code
            </Button>
          )}
          <Button variant="outline" className="flex-1 gap-1.5" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
