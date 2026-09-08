import { browser } from 'wxt/browser';
import type {
  ExtensionMessage,
  MessageResponse,
  MessageResponseMap,
} from './message-types';

export async function sendExtensionMessage<T extends ExtensionMessage>(
  message: T,
): Promise<MessageResponseMap[T['type']]> {
  const response = (await browser.runtime.sendMessage(message)) as MessageResponse;
  if (!response?.ok) throw new Error(response?.error ?? 'INTERNAL_ERROR');
  return response.data as MessageResponseMap[T['type']];
}
