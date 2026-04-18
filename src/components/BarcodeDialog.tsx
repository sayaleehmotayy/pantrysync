import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ZoomIn, ZoomOut, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface BarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  storeName?: string;
  title?: string | null;
  /** Original receipt/coupon image as a fallback when no scannable code is available */
  fallbackImageUrl?: string | null;
}

// Detect a sensible barcode format from the code text
function detectFormat(code: string): string {
  const digits = code.replace(/\s/g, '');
  if (/^\d{13}$/.test(digits)) return 'EAN13';
  if (/^\d{8}$/.test(digits)) return 'EAN8';
  if (/^\d{12}$/.test(digits)) return 'UPC';
  return 'CODE128';
}

// A code is barcode-worthy only if non-empty and not the placeholder "RECEIPT"
function hasUsableCode(code: string) {
  const c = (code || '').trim();
  return c.length > 0 && c.toUpperCase() !== 'RECEIPT';
}

export function BarcodeDialog({ open, onOpenChange, code, storeName, title, fallbackImageUrl }: BarcodeDialogProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderError, setRenderError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const usable = hasUsableCode(code);

  // Render the barcode whenever it opens / code changes
  useEffect(() => {
    if (!open || !usable || !svgRef.current) return;
    setRenderError(false);
    const tryRender = (format: string) => {
      JsBarcode(svgRef.current, code, {
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
    } catch {
      try { tryRender('CODE128'); } catch { setRenderError(true); }
    }
  }, [open, code, usable]);

  // Reset zoom each time we open
  useEffect(() => {
    if (open) { setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [open]);

  const copy = () => {
    if (!usable) return;
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  // Show image fallback when no usable code OR barcode render failed
  const showImageFallback = !usable || renderError;

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: pan.x, y: pan.y, startX: e.clientX, startY: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.x + (e.clientX - dragRef.current.startX),
      y: dragRef.current.y + (e.clientY - dragRef.current.startY),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-white p-6 pt-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-center text-black">
              {storeName || 'Show at checkout'}
            </DialogTitle>
            {title && <p className="text-xs text-center text-neutral-600 mt-1">{title}</p>}
          </DialogHeader>

          {showImageFallback ? (
            fallbackImageUrl ? (
              <div className="space-y-2">
                <div
                  className="relative bg-neutral-100 rounded-lg overflow-hidden touch-none select-none"
                  style={{ height: 320 }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <img
                    src={fallbackImageUrl}
                    alt="Coupon"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-contain transition-transform"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                      cursor: zoom > 1 ? 'grab' : 'default',
                    }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setZoom(z => Math.max(1, z - 0.5)); if (zoom - 0.5 <= 1) setPan({ x: 0, y: 0 }); }}>
                    <ZoomOut className="w-3.5 h-3.5" /> Out
                  </Button>
                  <span className="text-xs text-neutral-600 font-mono w-10 text-center">{zoom.toFixed(1)}x</span>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setZoom(z => Math.min(5, z + 0.5))}>
                    <ZoomIn className="w-3.5 h-3.5" /> In
                  </Button>
                </div>
                {usable && renderError && (
                  <p className="text-[11px] text-center text-amber-700 bg-amber-50 rounded p-2">
                    Code <span className="font-mono font-bold">{code}</span> can't render as a barcode — show the original photo instead.
                  </p>
                )}
              </div>
            ) : usable ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-neutral-600 mb-3">This code can't be rendered as a barcode.</p>
                <p className="font-mono text-2xl font-bold tracking-wider text-black select-all">{code}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ImageIcon className="w-10 h-10 text-neutral-300 mb-3" />
                <p className="text-sm text-neutral-600">No barcode or photo available for this coupon.</p>
              </div>
            )
          ) : (
            <div className="flex justify-center bg-white rounded-lg">
              <svg ref={svgRef} className="max-w-full h-auto" />
            </div>
          )}

          <p className="text-[11px] text-center text-neutral-500 mt-3">
            Show this screen to the cashier
          </p>
        </div>

        <div className="bg-background p-3 flex gap-2 border-t">
          {usable && (
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
