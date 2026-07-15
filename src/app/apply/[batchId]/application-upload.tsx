"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compression";
import type { UploadSlot } from "@/lib/types/requirements";
import type { ApplicationFileValue } from "@/lib/validation";

import { CameraCapture } from "@/components/camera-capture";

/**
 * Per-slot document uploader for a course application.
 *
 * Uploads happen INLINE the moment a file is chosen — independent of form
 * submit — so a failed upload never costs the applicant their typed answers
 * (there is no draft/save). Files land in the private `application-uploads`
 * bucket at `{userId}/{uuid}/{filename}`; storage RLS (0007) confines writes to
 * the caller's own `{userId}/` folder. The reported manifest `storage_path`
 * carries the `application-uploads/` bucket prefix that the shared zod schema
 * and the `submit_application` RPC both require.
 *
 * Client-side mime/size checks mirror the slot config for UX only; the RPC
 * re-checks everything server-side.
 */
const BUCKET = "application-uploads";
const STORAGE_PREFIX = "application-uploads";

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.length > 0 ? cleaned : "upload";
}

type Preview =
  | { kind: "image"; url: string }
  | { kind: "pdf" }
  | null;

interface ApplicationUploadProps {
  slot: UploadSlot;
  userId: string;
  value: ApplicationFileValue | null;
  onChange: (value: ApplicationFileValue | null) => void;
  onUploadingChange: (uploading: boolean) => void;
  invalid?: boolean;
}

export function ApplicationUpload({
  slot,
  userId,
  value,
  onChange,
  onUploadingChange,
  invalid,
}: ApplicationUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);

  const maxBytes = slot.max_size_mb * 1024 * 1024;
  const acceptsWebp = slot.accepted_types.includes("image/webp");

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
    setPreview({ kind: "image", url });
  }, []);

  const clearLocalPreview = useCallback(() => {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }
  }, []);

  const acceptedLabel = slot.accepted_types
    .map((t) => t.split("/")[1]?.toUpperCase())
    .filter(Boolean)
    .join(", ");

  const handleFile = useCallback(
    async (file: File) => {
      // 1. Client-side mime check (UX only — the RPC re-checks).
      if (!slot.accepted_types.includes(file.type)) {
        toast.error(`Please choose a ${acceptedLabel} file for ${slot.label}.`);
        return;
      }

      setUploading(true);
      try {
        // 2. Compress images where the slot accepts the resulting WebP; else
        //    keep the original so its mime stays within accepted_types.
        const isImage = file.type.startsWith("image/");
        let toUpload = file;
        if (isImage) {
          const compressed = await compressImage(file);
          if (slot.accepted_types.includes(compressed.type)) {
            toUpload = compressed;
          }
        }

        if (!slot.accepted_types.includes(toUpload.type)) {
          toast.error(`Please choose a ${acceptedLabel} file for ${slot.label}.`);
          return;
        }
        if (toUpload.size > maxBytes) {
          toast.error(
            `${slot.label} must be ${slot.max_size_mb}MB or smaller.`
          );
          return;
        }

        // 3. Upload to the user's own folder (RLS enforces the {userId}/ prefix).
        const supabase = createClient();
        const uuid = crypto.randomUUID();
        const objectPath = `${userId}/${uuid}/${sanitizeFilename(toUpload.name)}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, toUpload, {
            upsert: false,
            contentType: toUpload.type,
          });

        if (error) {
          toast.error("Upload failed. Please try again.");
          return;
        }

        // 4. Record the manifest entry (storage_path carries the bucket prefix)
        //    + show a local preview.
        onChange({
          requirement_key: slot.key,
          storage_path: `${STORAGE_PREFIX}/${objectPath}`,
          original_filename: file.name,
          mime_type: toUpload.type,
          size_bytes: toUpload.size,
        });

        if (toUpload.type.startsWith("image/")) {
          setLocalImagePreview(toUpload);
        } else {
          clearLocalPreview();
          setPreview({ kind: "pdf" });
        }
        toast.success(`${slot.label} uploaded.`);
      } finally {
        setUploading(false);
      }
    },
    [
      slot,
      userId,
      maxBytes,
      acceptedLabel,
      onChange,
      setLocalImagePreview,
      clearLocalPreview,
    ]
  );

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again re-fires change.
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function handleRemove() {
    clearLocalPreview();
    setPreview(null);
    onChange(null);
  }

  function handleTakePhoto() {
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
  const showPreview =
    preview ??
    (value ? (isPdfPath(value.storage_path) ? { kind: "pdf" } : null) : null);

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        invalid && "border-destructive/60"
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{slot.label}</p>
        {slot.required ? (
          <span className="text-destructive text-xs">required</span>
        ) : (
          <span className="text-muted-foreground text-xs">optional</span>
        )}
        {hasFile ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2Icon className="size-3" />
            Added
          </Badge>
        ) : null}
      </div>

      {/* Preview */}
      <div className="mt-3">
        {showPreview?.kind === "image" && "url" in showPreview ? (
          <div className="bg-muted overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={showPreview.url}
              alt={`${slot.label} preview`}
              className="mx-auto max-h-48 w-full object-contain"
            />
          </div>
        ) : showPreview?.kind === "pdf" ? (
          <div className="text-muted-foreground bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-4 text-sm">
            <FileTextIcon className="size-5 shrink-0" />
            <span className="truncate">
              {value?.original_filename ?? "PDF uploaded."}
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

        {acceptsWebp ? (
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
        ) : null}

        {hasFile ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={handleRemove}
          >
            <XIcon />
            Remove
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        {acceptedLabel} · up to {slot.max_size_mb}MB
      </p>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={slot.accepted_types.join(",")}
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />

      {/* Desktop camera modal (only when the slot accepts WebP captures) */}
      {acceptsWebp ? (
        <CameraCapture
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          facingMode="environment"
          onCapture={(file) => void handleFile(file)}
        />
      ) : null}
    </div>
  );
}
