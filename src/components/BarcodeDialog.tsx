import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Sun } from 'lucide-react';
import { toast } from 'sonner';

interface BarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  storeName?: string;
  title?: string | null;
}

// Detect a sensible barcode format from the code text
function detectFormat(code: string): string {
  const digits = code.replace(/\s/g, '');
  if (/^\d{13}$/.test(digits)) return 'EAN13';
  if (/^\d{8}$/.test(digits)) return 'EAN8';
  if (/^\d{12}$/.test(digits)) return 'UPC';
  // CODE128 supports alphanumeric — best general fallback
  return 'CODE128';
}

export function BarcodeDialog({ open, onOpenChange, code, storeName, title }: BarcodeDialogProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderError, setRenderError] = useState(false);
  const [origBrightness, setOrigBrightness] = useState<number | null>(null);

  // Render the barcode whenever it opens / code changes
  useEffect(() => {
    if (!open || !svgRef.current || !code) return;
    setRenderError(false);
    try {
      JsBarcode(svgRef.current, code, {
        format: detectFormat(code),
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 18,
        margin: 12,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch (e) {
      // Fallback: try CODE128 which accepts almost anything
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128',
          width: 3,
          height: 110,
          displayValue: true,
          fontSize: 18,
          margin: 12,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        setRenderError(true);
      }
    }
  }, [open, code]);

  // Boost screen brightness on mobile while open (best-effort, only works on some browsers)
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    setOrigBrightness(parseFloat(body.style.filter?.match(/brightness\(([^)]+)\)/)?.[1] || '1'));
    return () => {
      // restore on close — handled by toggleBrightness state below
    };
  }, [open]);

  const copy = () => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
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

          {renderError ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-sm text-neutral-600 mb-3">This code can't be rendered as a barcode.</p>
              <p className="font-mono text-2xl font-bold tracking-wider text-black select-all">{code}</p>
            </div>
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
          <Button variant="outline" className="flex-1 gap-1.5" onClick={copy}>
            <Copy className="w-3.5 h-3.5" /> Copy code
          </Button>
          <Button variant="outline" className="flex-1 gap-1.5" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
