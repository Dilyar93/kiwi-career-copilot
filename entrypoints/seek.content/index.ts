import { SeekAdapter } from '../../src/adapters/seek/seek-adapter';
import { PageController } from '../../src/browser/page-controller';
import { browser } from 'wxt/browser';
import '../../src/browser/content.css';

export default defineContentScript({
  matches: ['https://www.seek.co.nz/*', 'https://nz.seek.com/*'],
  main() {
    const scope = globalThis as typeof globalThis & { __kiwiSeekContentActive?: boolean };
    if (scope.__kiwiSeekContentActive) return;
    scope.__kiwiSeekContentActive = true;
    const adapter = new SeekAdapter();
    const controller = new PageController(adapter);
    const readJob = () => {
      const url = new URL(document.URL);
      const expectedId = url.pathname.match(/\/job\/(\d+)(?:[/?#]|$)/)?.[1]
        ?? url.searchParams.get('jobId');
      const result = adapter.extractCurrentJob(document, url);
      const root = document.querySelector('[data-automation="jobDetailsPage"]');
      const renderedId = root?.getAttribute('data-job-id')
        ?? root?.querySelector<HTMLAnchorElement>('a[data-automation="job-detail-apply"]')
          ?.getAttribute('href')?.match(/\/job\/(\d+)(?:[/?#]|$)/)?.[1];
      return {
        result,
        ready: !expectedId || (
          result.ok
          && result.job.externalId === expectedId
          && (!renderedId || renderedId === expectedId)
        ),
      };
    };
    type JobResult = ReturnType<typeof adapter.extractCurrentJob>;
    let pendingJob: Promise<JobResult> | undefined;
    const readSettledJob = () => {
      const current = readJob();
      if (current.ready) return Promise.resolve(current.result);
      pendingJob ??= new Promise<JobResult>((resolve) => {
        let settleTimer: ReturnType<typeof setTimeout> | undefined;
        const observer = new MutationObserver(() => check());
        const finish = (result: JobResult) => {
          observer.disconnect();
          if (settleTimer !== undefined) clearTimeout(settleTimer);
          clearTimeout(deadline);
          resolve(result);
        };
        const check = () => {
          if (settleTimer !== undefined) clearTimeout(settleTimer);
          const next = readJob();
          if (next.ready) {
            settleTimer = setTimeout(() => {
              const settled = readJob();
              if (settled.ready) finish(settled.result);
            }, 150);
          }
        };
        const deadline = setTimeout(() => finish(readJob().result), 5_000);
        observer.observe(document, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
        check();
      }).finally(() => {
        pendingJob = undefined;
      });
      return pendingJob;
    };
    const readCurrentJob = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'GET_CURRENT_JOB'
      ) {
        void readSettledJob().then(sendResponse);
        return true;
      }
    };
    browser.runtime.onMessage.addListener(readCurrentJob);
    void controller.start();
    window.addEventListener('pagehide', () => {
      delete scope.__kiwiSeekContentActive;
      browser.runtime.onMessage.removeListener(readCurrentJob);
      controller.stop();
    }, { once: true });
  },
});
