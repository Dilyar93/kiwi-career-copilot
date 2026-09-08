type SeenCallback = () => void;

export class VisibilityTracker {
  private readonly callbacks = new Map<Element, SeenCallback>();
  private readonly timers = new Map<Element, ReturnType<typeof setTimeout>>();
  private readonly seen = new WeakSet<Element>();
  private readonly observer: IntersectionObserver;

  constructor(delayMs = 800) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.5 &&
            !this.seen.has(entry.target)
          ) {
            if (!this.timers.has(entry.target)) {
              this.timers.set(
                entry.target,
                setTimeout(() => {
                  this.timers.delete(entry.target);
                  this.seen.add(entry.target);
                  this.callbacks.get(entry.target)?.();
                  this.observer.unobserve(entry.target);
                }, delayMs),
              );
            }
          } else {
            this.clearTimer(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );
  }

  observe(element: Element, callback: SeenCallback): void {
    if (this.seen.has(element)) return;
    this.callbacks.set(element, callback);
    this.observer.observe(element);
  }

  unobserve(element: Element): void {
    this.clearTimer(element);
    this.callbacks.delete(element);
    this.observer.unobserve(element);
  }

  disconnect(): void {
    for (const element of this.timers.keys()) this.clearTimer(element);
    this.callbacks.clear();
    this.observer.disconnect();
  }

  private clearTimer(element: Element): void {
    const timer = this.timers.get(element);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(element);
  }
}
