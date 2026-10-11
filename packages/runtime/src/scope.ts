/** What one run took: let go of all at once when it stops (each, whatever the others throw); once stopped, what is added after at once. */
export class Scope {
  readonly controller = new AbortController();
  private readonly disposers: (() => void)[] = [];
  constructor(private readonly onError: (error: unknown) => void) {}

  get closed(): boolean {
    return this.controller.signal.aborted;
  }

  /** Kept until it stops; what it gives back drops it (let go of before, by its owner). */
  add(dispose: () => void): () => void {
    if (this.closed) {
      this.run(dispose);
      return () => {};
    }
    this.disposers.push(dispose);
    return () => {
      const at = this.disposers.indexOf(dispose);
      if (at >= 0) this.disposers.splice(at, 1);
    };
  }

  dispose(): void {
    if (this.closed) return;
    this.controller.abort();
    for (const d of this.disposers.splice(0).reverse()) this.run(d);
  }

  private run(d: () => void): void {
    try {
      d();
    } catch (error) {
      this.onError(error);
    }
  }
}
