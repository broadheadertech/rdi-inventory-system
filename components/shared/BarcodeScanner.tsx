"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type BarcodeScannerProps = {
  onScan: (barcode: string) => void;
  isActive: boolean;
};

export function BarcodeScanner({ onScan, isActive }: BarcodeScannerProps) {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastScanRef = useRef<{ barcode: string; time: number } | null>(null);
  const containerIdRef = useRef(`barcode-reader-${Date.now()}`);

  const handleScan = useCallback(
    (decodedText: string) => {
      // Debounce: ignore same barcode within 500ms
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.barcode === decodedText &&
        now - lastScanRef.current.time < 500
      ) {
        return;
      }
      lastScanRef.current = { barcode: decodedText, time: now };
      onScan(decodedText);
    },
    [onScan]
  );

  const startScanning = useCallback(async () => {
    if (scannerRef.current) return;
    setError(null);

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );
      const scanner = new Html5Qrcode(containerIdRef.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => handleScan(decodedText),
        () => {
          /* ignore per-frame scan errors */
        }
      );

      scannerRef.current = scanner;
      setIsScanning(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Camera access denied";
      if (message.includes("NotAllowedError") || message.includes("denied")) {
        setError("Camera access needed for scanning");
      } else {
        setError(message);
      }
    }
  }, [handleScan]);

  const stopScanning = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
    } catch {
      // Scanner may already be stopped
    }
    scannerRef.current = null;
    setIsScanning(false);
  }, []);

  // Auto-stop when isActive changes to false
  useEffect(() => {
    if (!isActive && isScanning) {
      stopScanning();
    }
  }, [isActive, isScanning, stopScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  if (!isActive) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant={isScanning ? "destructive" : "default"}
          className="min-h-14 gap-2"
          onClick={isScanning ? stopScanning : startScanning}
        >
          {isScanning ? (
            <>
              <CameraOff className="h-5 w-5" />
              Stop Scanner
            </>
          ) : (
            <>
              <Camera className="h-5 w-5" />
              Start Scanner
            </>
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div
        id={containerIdRef.current}
        className={isScanning ? "min-h-[200px] overflow-hidden rounded-md" : "hidden"}
      />
    </div>
  );
}
