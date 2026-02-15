// src/hooks/useUploads.ts
import { useEffect, useState } from "react";
import type { UploadKind, UploadRecord } from "../lib/types";
import { addUpload, deleteUpload, listUploadsForRole } from "../lib/uploadStore";
import { getUser } from "../lib/auth";

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
      setItems(listUploadsForRole(role, email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File, kind: UploadKind) {
    setError(null);
    await addUpload({ file, kind, uploaderEmail: email, uploaderRole: role });
    await load();
  }

  async function remove(id: string) {
    deleteUpload(id);
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, email]);

  return { items, loading, error, reload: load, upload, remove, role, email };
}
