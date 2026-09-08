import { t } from '../i18n';
import type {
  CardDecorationContext,
  CardDecorationHandle,
} from '../adapters/site-adapter';

export function decorateCard(
  card: HTMLElement,
  initialContext: CardDecorationContext,
): CardDecorationHandle {
  card.querySelector(':scope > .jobfilter-card-controls')?.remove();
  card.classList.add('jobfilter-card');

  const document = card.ownerDocument;
  const controls = document.createElement('div');
  controls.className = 'jobfilter-card-controls';
  controls.dataset.jobfilterControls = '1';

  const brand = document.createElement('span');
  brand.className = 'jobfilter-card-brand';
  brand.textContent = 'Kiwi';

  const seen = document.createElement('span');
  seen.className = 'jobfilter-seen';

  const reason = document.createElement('span');
  reason.className = 'jobfilter-hidden-reason';

  const distance = document.createElement('span');
  distance.className = 'jobfilter-distance';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'jobfilter-dismiss';

  controls.append(brand, seen, distance, reason, button);
  card.append(controls);

  let context = initialContext;
  const render = () => {
    seen.textContent = context.seen ? t('seen') : '';
    seen.hidden = !context.seen;
    const firstReason = context.evaluation.reasons[0];
    reason.textContent =
      firstReason?.ruleType === 'dismissed'
        ? t('dismiss')
        : firstReason?.label ?? '';
    reason.hidden = context.evaluation.reasons.length === 0;
    distance.textContent = context.evaluation.distance
      ? t('approxDistance', {
          distance: Math.round(context.evaluation.distance.centreDistanceKm),
        })
      : context.evaluation.distanceUnavailable
        ? t('distanceUnavailable')
        : '';
    distance.hidden = !distance.textContent;
    button.textContent = context.dismissed ? t('undo') : t('dismiss');
    button.ariaLabel = button.textContent;
  };
  controls.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (context.dismissed) context.onRestore();
    else context.onDismiss();
  });
  render();

  return {
    update(nextContext) {
      context = nextContext;
      render();
    },
    destroy() {
      controls.remove();
      card.classList.remove('jobfilter-card');
    },
  };
}
