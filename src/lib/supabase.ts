import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zpoqdjccnvrkfkixboph.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_3o6nrjHwPcmallYW_Ss9xQ_QBHFGULS';

export const supabase = createClient(supabaseUrl, supabaseKey);

export type AssetCategory = 'ai_project' | 'ai_prompt' | 'coding';
export type UserRole = 'user' | 'creator' | 'admin';

export interface BuiltSellProfile {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  account_number: number;
  verified: boolean;
  created_at: string;
}

export interface BuiltSellListing {
  id: string;
  author_id: string | null;
  author_name: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: AssetCategory;
  price_usd: number;
  ai_model: string | null;
  prompt_text: string | null;
  system_instructions: string | null;
  code_snippet: string | null;
  programming_language: string | null;
  framework: string | null;
  demo_url: string | null;
  repo_url: string | null;
  project_file_url: string | null;
  project_file_name: string | null;
  project_file_size: number | null;
  tags: string[];
  license_type: 'Personal Use' | 'Commercial License' | 'MIT Open Source' | 'Exclusive Full IP';
  copyright_holder: string;
  copyright_year: number;
  copyright_certificate_id: string;
  content_fingerprint: string;
  status: 'pending' | 'published' | 'rejected';
  is_featured: boolean;
  downloads_count: number;
  rating: number;
  created_at: string;
}

export interface CopyrightClaim {
  id: string;
  listing_id: string;
  reporter_id: string | null;
  reporter_email: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
}

export async function computeSha256Fingerprint(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hashHex.slice(0, 28)}`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
