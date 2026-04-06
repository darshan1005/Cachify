interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

export class LRUList<K, V> {
  private map = new Map<K, LRUNode<K, V>>();
  private head: LRUNode<K, V> | null = null; // most recent
  private tail: LRUNode<K, V> | null = null; // least recent
  private _size = 0;

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  set(key: K, value: V): { key: K, value: V } | undefined {
    // returns evicted key/value if maxSize exceeded, else undefined
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return undefined;
    }

    const node: LRUNode<K, V> = { key, value, prev: null, next: this.head };
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.map.set(key, node);
    this._size++;

    if (this._size > this.maxSize) {
      return this.evictTail();
    }
    return undefined;
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    this._size--;
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this._size = 0;
  }

  get size() { return this._size; }
  keys() { return this.map.keys(); }
  entries() {
    return Array.from(this.map.entries()).map(([key, node]) => [key, node.value] as [K, V]);
  }

  peekTail(): { key: K, value: V } | undefined {
    if (!this.tail) return undefined;
    return { key: this.tail.key, value: this.tail.value };
  }
  evictTail(): { key: K, value: V } | undefined {
    if (!this.tail) return undefined;
    const entry = { key: this.tail.key, value: this.tail.value };
    this.removeNode(this.tail);
    this.map.delete(entry.key);
    this._size--;
    return entry;
  }

  private moveToHead(node: LRUNode<K, V>) {
    if (node === this.head) return;
    this.removeNode(node);
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeNode(node: LRUNode<K, V>) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }
}
