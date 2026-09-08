export class UrlWatcher {
  private signature: string;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly getSignature: () => string,
    private readonly onChange: () => void | Promise<void>,
    private readonly intervalMs = 500,
  ) {
    this.signature = getSignature();
  }

  private readonly check = () => {
    const signature = this.getSignature();
    if (signature === this.signature) return;
    this.signature = signature;
    void this.onChange();
  };

  start(): void {
    window.addEventListener('popstate', this.check);
    this.timer = setInterval(this.check, this.intervalMs);
  }

  stop(): void {
    window.removeEventListener('popstate', this.check);
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
