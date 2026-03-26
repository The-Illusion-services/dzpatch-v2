import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { PackageCategory } from '@/types/database';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface AppDataState {
  categories: PackageCategory[];
  categoriesLoadedAt: number | null;

  fetchCategories: () => Promise<void>;
}

export const useAppDataStore = create<AppDataState>((set, get) => ({
  categories: [],
  categoriesLoadedAt: null,

  fetchCategories: async () => {
    const { categoriesLoadedAt, categories } = get();

    // Return early if cache is fresh
    const isFresh =
      categoriesLoadedAt !== null &&
      categories.length > 0 &&
      Date.now() - categoriesLoadedAt <= CACHE_TTL_MS;

    if (isFresh) return;

    const { data } = await supabase
      .from('package_categories')
      .select('id, name, icon_name, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (data) {
      set({ categories: data as PackageCategory[], categoriesLoadedAt: Date.now() });
    }
  },
}));
