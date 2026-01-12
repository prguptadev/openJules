export class LruCache<T, U> {
  private cache = new Map<T, U>();
  constructor(private size: number) {}
  get(key: T) { return this.cache.get(key); }
  set(key: T, value: U) { this.cache.set(key, value); }
}
