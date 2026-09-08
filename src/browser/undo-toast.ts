import { t } from '../i18n';

export class UndoToast {
  private element: HTMLElement | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly document: Document) {}

  show(title: string, onUndo: () => void, durationMs = 10_000): void {
    this.clear();
    const element = this.document.createElement('div');
    element.className = 'jobfilter-toast';
    element.setAttribute('role', 'status');

    const message = this.document.createElement('span');
    message.textContent = t('hiddenJob', { title });
    const undo = this.document.createElement('button');
    undo.type = 'button';
    undo.textContent = t('undo');
    undo.ariaLabel = undo.textContent;
    undo.addEventListener('click', () => {
      this.clear();
      onUndo();
    });
    element.append(message, undo);
    this.document.body.append(element);
    this.element = element;
    this.timer = setTimeout(() => this.clear(), durationMs);
  }

  clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.element?.remove();
    this.element = undefined;
  }
}
