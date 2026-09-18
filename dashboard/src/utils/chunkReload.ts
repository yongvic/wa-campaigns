const RELOAD_KEY = 'wa_campaigns_chunk_reloaded';

export interface ChunkReloadDeps {
  reload: () => void;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export async function loadChunkWithReload<T>(
  factory: () => Promise<T>,
  deps: ChunkReloadDeps,
): Promise<T> {
  try {
    const mod = await factory();
    deps.storage.removeItem(RELOAD_KEY);
    return mod;
  } catch (err) {
    if (!deps.storage.getItem(RELOAD_KEY)) {
      deps.storage.setItem(RELOAD_KEY, '1');
      deps.reload();
      return new Promise<T>(() => {});
    }
    throw err;
  }
}
