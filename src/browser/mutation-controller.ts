export class MutationController {
  private readonly observer: MutationObserver;
  private readonly pending = new Set<Node>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly onBatch: (nodes: Node[]) => void | Promise<void>,
    private readonly delayMs = 100,
  ) {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => this.pending.add(node));
      }
      if (this.pending.size && this.timer === undefined) {
        this.timer = setTimeout(() => this.flush(), this.delayMs);
      }
    });
  }

  start(): void {
    this.observer.observe(this.root, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer.disconnect();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }

  private flush(): void {
    this.timer = undefined;
    const nodes = [...this.pending];
    this.pending.clear();
    void this.onBatch(nodes);
  }
}
