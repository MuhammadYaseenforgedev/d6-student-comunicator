// src/hooks/useUploads.ts
import { useEffect, useState } from "react";
import type { UploadKind, UploadRecord } from "../lib/types";
import { getUser } from "../lib/auth";
import {
  deleteUpload as deleteUploadApi,
  listUploads,
  uploadFile,
} from "../api/uploads";

export function useUploads() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").toLowerCase();

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listUploads();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load uploads");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File, kind: UploadKind) {
    setError(null);
    await uploadFile({ file, kind });
    await load();
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteUploadApi({ uploadId: id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete upload");
    }
  }

  useEffect(() => {
    load();
  }, [role, email]);

  return { items, loading, error, reload: load, upload, remove, role, email };
}
