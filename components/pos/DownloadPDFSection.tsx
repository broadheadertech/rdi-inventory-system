"use client";

import { BlobProvider } from "@react-pdf/renderer";
import { ReceiptPDF, type ReceiptData } from "@/components/shared/ReceiptPDF";
import { Button } from "@/components/ui/button";
import { Loader2, Download, AlertCircle } from "lucide-react";

// This component is loaded via next/dynamic with ssr:false in ReceiptViewer.
// Direct imports of @react-pdf/renderer are safe here — no SSR.

export default function DownloadPDFSection({
  receiptData,
}: {
  receiptData: ReceiptData;
}) {
  return (
    <BlobProvider document={<ReceiptPDF data={receiptData} />}>
      {({
        blob,
        loading,
        error,
      }: {
        blob: Blob | null;
        loading: boolean;
        error: Error | null;
      }) => {
        if (error) {
          return (
            <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              PDF generation failed. Use browser print instead.
            </div>
          );
        }

        const handleDownload = () => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `receipt-${receiptData.transaction.receiptNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };

        return (
          <Button
            className="min-h-14 w-full gap-2 text-lg"
            onClick={handleDownload}
            disabled={loading || !blob}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download PDF
              </>
            )}
          </Button>
        );
      }}
    </BlobProvider>
  );
}
