import { t } from '../i18n';

export interface PageCounts {
  scanned: number;
  shown: number;
  hidden: number;
}

export class PageSummary {
  private readonly element: HTMLElement;
  private readonly title: HTMLElement;
  private readonly counts: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly settings: HTMLButtonElement;
  private values: PageCounts = { scanned: 0, shown: 0, hidden: 0 };

  constructor(
    private readonly document: Document,
    anchor: HTMLElement,
    private readonly onSettings: () => void,
    private readonly onShowHiddenChange: (show: boolean) => void,
    private showHidden: boolean,
  ) {
    document.querySelectorAll('[data-jobfilter-summary]').forEach((element) => element.remove());
    this.element = document.createElement('section');
    this.element.className = 'jobfilter-summary';
    this.element.dataset.jobfilterSummary = '1';
    this.element.ariaLabel = t('appName');

    this.title = document.createElement('strong');
    const brand = document.createElement('span');
    brand.className = 'jobfilter-brand-mark';
    brand.textContent = 'K';
    brand.ariaHidden = 'true';
    const brandGroup = document.createElement('span');
    brandGroup.className = 'jobfilter-summary-brand';
    brandGroup.append(brand, this.title);

    this.counts = document.createElement('span');
    this.counts.className = 'jobfilter-summary-counts';
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'jobfilter-toggle';
    this.toggle.addEventListener('click', () => {
      this.setShowHidden(!this.showHidden);
      this.onShowHiddenChange(this.showHidden);
    });

    this.settings = document.createElement('button');
    this.settings.type = 'button';
    this.settings.className = 'jobfilter-open';
    this.settings.addEventListener('click', this.onSettings);

    const actions = document.createElement('span');
    actions.className = 'jobfilter-summary-actions';
    actions.append(this.toggle, this.settings);
    this.element.append(brandGroup, this.counts, actions);
    anchor.before(this.element);
    this.setShowHidden(showHidden);
    this.render();
  }

  update(counts: PageCounts): void {
    this.values = counts;
    this.render();
  }

  setShowHidden(show: boolean): void {
    this.showHidden = show;
    this.document.documentElement.classList.toggle('jobfilter-show-hidden', show);
    this.render();
  }

  destroy(): void {
    this.element.remove();
  }

  private render(): void {
    this.title.textContent = t('appName');
    this.counts.textContent = t('summaryCounts', {
      scanned: this.values.scanned,
      shown: this.values.shown,
      hidden: this.values.hidden,
    });
    this.toggle.textContent = t(this.showHidden ? 'hideHidden' : 'showHidden');
    this.toggle.ariaLabel = this.toggle.textContent;
    this.settings.textContent = t('openKiwi');
    this.settings.ariaLabel = this.settings.textContent;
  }
}
