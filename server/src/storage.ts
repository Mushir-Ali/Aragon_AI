import { createClient } from "@supabase/supabase-js";

// Storage sits behind this interface so Supabase can be swapped for S3
// without touching routes or the validation pipeline.
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  publicUrl(key: string): string;
  remove(key: string): Promise<void>;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const BUCKET = process.env.SUPABASE_BUCKET ?? "uploads";

export const storage: Storage = {
  async put(key, body, contentType) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, body, { contentType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },

  publicUrl(key) {
    return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  },

  async remove(key) {
    await supabase.storage.from(BUCKET).remove([key]);
  },
};