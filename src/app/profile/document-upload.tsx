"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { MAX_DOCUMENT_BYTES, type ProfileDocumentSlot } from "@/lib/validation";

import { CameraCapture } from "@/components/camera-capture";
import { signProfileDocument } from "./actions";

const BUCKET = "profile-documents";

function extForFile(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

type Preview =
  | { kind: "image"; url: string; local: boolean }
  | { kind: "pdf"; url: string | null }
  | null;

interface DocumentUploadProps {
  slot: ProfileDocumentSlot;
  userId: string;
  value: string;
  initialSignedUrl: string | null;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  invalid?: boolean;
}

export function DocumentUpload({
  slot,
  userId,
  value,
  initialSignedUrl,
  onChange,
  onUploadingChange,
  invalid,
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>(() => {
    if (!value) return null;
    if (isPdfPath(value)) return { kind: "pdf", url: initialSignedUrl };
    return initialSignedUrl
      ? { kind: "image", url: initialSignedUrl, local: false }
      : null;
  });

  useEffect(() => {
    onUploadingChange(uploading);
  }, [uploading, onUploadingChange]);

  // Revoke any object URL we created on unmount.
  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  const setLocalImagePreview = useCallback((file: File) => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setPreview({ kind: "image", url, local: true });
  }, []);

  // If a server-signed preview URL expires (60s), fetch a fresh one on error.
  const refreshSignedPreview = useCallback(async () => {
    if (!value) return;
    const res = await signProfileDocument(value);
    if ("url" in res) {
      setPreview((prev) =>
        prev?.kind === "image"
          ? { kind: "image", url: res.url, local: false }
          : prev?.kind === "pdf"
            ? { kind: "pdf", url: res.url }
            : prev
      );
    }
  }, [value]);

  const handleFile = useCallback(
    async (file: File) => {
      // 1. Client-side validation (UX only — RLS + the save action re-check).
      if (!slot.acceptedMimeTypes.includes(file.type)) {
        toast.error(
          slot.imageOnly
            ? "Please choose a JPEG, PNG or WebP image."
            : "Please choose an image (JPEG/PNG/WebP) or a PDF."
        );
        return;
      }
      const isImage = file.type.startsWith("image/");
      if (!isImage && file.size > MAX_DOCUMENT_BYTES) {
        toast.error(
          "This file is larger than 10MB. Please choose a smaller file."
        );
        return;
      }

      setUploading(true);
      try {
        // 2. Compress images down to the 2MB target where possible.
        const toUpload = isImage ? await compressImage(file) : file;

        if (toUpload.size > MAX_DOCUMENT_BYTES) {
          toast.error("This file is too large. Please choose a smaller file.");
          return;
        }

        // 3. Upload to the user's own folder (RLS enforces {userId}/...).
        const supabase = createClient();
        const path = `${userId}/${slot.key}-${Date.now()}.${extForFile(toUpload)}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, toUpload, {
            upsert: false,
            contentType: toUpload.type,
          });

        if (error) {
          toast.error("Upload failed. Please try again.");
          return;
        }

        // 4. Store the object path in form state + show a local preview.
        onChange(path);
        if (isImage) {
          setLocalImagePreview(toUpload);
        } else {
          if (localUrlRef.current) {
            URL.revokeObjectURL(localUrlRef.current);
            localUrlRef.current = null;
          }
          setPreview({ kind: "pdf", url: null });
        }
        toast.success(`${slot.label} uploaded.`);
      } finally {
        setUploading(false);
      }
    },
    [slot, userId, onChange, setLocalImagePreview]
  );

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again re-fires change.
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function handleTakePhoto() {
    // On touch devices the capture-enabled file input is the most reliable path
    // to the camera; on desktop we open the getUserMedia modal. Detected at
    // click time so there's no SSR/hydration guesswork.
    const coarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    if (coarsePointer) {
      captureInputRef.current?.click();
    } else {
      setCameraOpen(true);
    }
  }

  const hasFile = Boolean(value);

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        invalid && "border-destructive/60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{slot.label}</p>
            {hasFile ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2Icon className="size-3" />
                Added
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {slot.description}
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-3">
        {preview?.kind === "image" && preview.url ? (
          <div className="bg-muted overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={`${slot.label} preview`}
              onError={
                preview.local ? undefined : () => void refreshSignedPreview()
              }
              className="mx-auto max-h-48 w-full object-contain"
            />
          </div>
        ) : preview?.kind === "pdf" ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-4 text-sm">
            <FileTextIcon className="size-5 shrink-0" />
            <span>
              PDF uploaded.
              {preview.url ? (
                <>
                  {" "}
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    View
                  </a>
                </>
              ) : null}
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center justify-center rounded-md border border-dashed px-3 py-8 text-xs">
            No file yet
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UploadIcon />
          )}
          {hasFile ? "Replace file" : "Upload file"}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={handleTakePhoto}
        >
          <CameraIcon />
          Take photo
        </Button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={slot.accept}
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture={slot.cameraFacing}
        className="hidden"
        onChange={onInputChange}
      />

      {/* Desktop camera modal */}
      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        facingMode={slot.cameraFacing}
        onCapture={(file) => void handleFile(file)}
      />
    </div>
  );
}
