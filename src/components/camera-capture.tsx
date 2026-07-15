"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, RotateCcwIcon, CircleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Desktop camera-capture modal using getUserMedia. Shows a live preview, a
 * capture button, and a retake option. If camera access is unavailable or
 * denied it shows a clear message — every caller always exposes a plain
 * file-upload fallback alongside "Take photo".
 *
 * On mobile we don't use this modal at all: an <input capture> is sufficient and
 * more reliable there.
 *
 * Shared building block: used by both the profile document uploader and the
 * course-application uploader.
 */
function cameraErrorMessage(err: unknown): string {
  return err instanceof Error && err.message === "unsupported"
    ? "Your browser does not support camera capture."
    : "We couldn't access your camera. Please grant permission, or use file upload instead.";
}

export function CameraCapture({
  open,
  onOpenChange,
  facingMode,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facingMode: "environment" | "user";
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<{ url: string; file: File } | null>(
    null
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearCaptured = useCallback(() => {
    setCaptured((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  // Acquire the camera and wire it to the <video>. Touches only refs + the DOM
  // (no React state), so it is safe to call from an effect without triggering a
  // cascading render; failures are reported by the caller via setError.
  const attachStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("unsupported");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false,
    });
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
  }, [facingMode]);

  // Start the stream while the dialog is open; stop it on close/unmount. State
  // updates happen only inside the promise's .catch (an external-event callback).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    attachStream().catch((err) => {
      if (!cancelled) setError(cameraErrorMessage(err));
    });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, attachStream, stopStream]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.webp`, {
          type: "image/webp",
        });
        clearCaptured();
        setCaptured({ url: URL.createObjectURL(file), file });
        stopStream();
      },
      "image/webp",
      0.92
    );
  }

  function handleRetake() {
    clearCaptured();
    setError(null);
    attachStream().catch((err) => setError(cameraErrorMessage(err)));
  }

  function handleUse() {
    if (!captured) return;
    const { file } = captured;
    stopStream();
    clearCaptured();
    setError(null);
    onCapture(file);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      stopStream();
      clearCaptured();
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>
            Position the document in frame, then capture. You can retake before
            using it.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center text-sm">
            <CircleAlertIcon className="text-destructive size-6" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="bg-muted overflow-hidden rounded-md">
            {captured ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={captured.url}
                alt="Captured preview"
                className="max-h-80 w-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-80 w-full object-contain"
              />
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {captured ? (
            <>
              <Button type="button" variant="outline" onClick={handleRetake}>
                <RotateCcwIcon />
                Retake
              </Button>
              <Button type="button" onClick={handleUse}>
                Use photo
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleCapture}
              disabled={!!error}
              className="w-full"
            >
              <CameraIcon />
              Capture
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
