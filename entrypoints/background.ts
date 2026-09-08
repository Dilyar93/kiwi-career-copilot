import { browser } from 'wxt/browser';
import {
  broadcastExtensionMessage,
  clearPageStatus,
  messageErrorCode,
  routeMessage,
} from '../src/messaging/background-router';
import type { MessageResponse } from '../src/messaging/message-types';
import { cleanupExpiredSeen } from '../src/storage/job-state-repository';
import { PREFERENCES_KEY } from '../src/storage/settings-repository';

export default defineBackground(() => {
  void browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  void Promise.all([
    browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    browser.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    cleanupExpiredSeen(),
  ]).catch(() => undefined);

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void routeMessage(message, sender)
      .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: messageErrorCode(error),
        } satisfies MessageResponse),
      );
    return true;
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    const type =
      areaName === 'sync' && changes[PREFERENCES_KEY]
        ? 'PREFERENCES_CHANGED'
        : null;
    if (type) {
      void broadcastExtensionMessage({ type });
    }
  });

  browser.tabs.onRemoved.addListener(clearPageStatus);
});
