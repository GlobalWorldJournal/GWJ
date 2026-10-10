import { DEFAULT_LANGUAGE, isLanguage } from '@gwj/shared-types';
import { setDeliveryPlanner } from '../services/articleService';
import type { ChannelJobAction } from '../db/schema/channelJobs';
import type { PublishChannel } from './types';

/**
 * Which channels act on an article change of `action` in `language`: enabled
 * channels serving that edition — and, for an update or a retraction, only
 * channels that can do one.
 */
export function planDeliveries(
  channels: readonly PublishChannel[],
  language: string,
  action: ChannelJobAction,
): string[] {
  const edition = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  return channels
    .filter((channel) => channel.isEnabled() && channel.servesLanguage(edition))
    .filter((channel) => (action === 'update' ? Boolean(channel.update) : true))
    .filter((channel) => (action === 'retract' ? Boolean(channel.retract) : true))
    .map((channel) => channel.name);
}

/**
 * Route article changes to `channels`: registers the planner the article service
 * consults when it queues distribution jobs (in the transaction of each change).
 * The jobs are worked by the outbox (outbox.ts). Returns an unregister function
 * for graceful shutdown and tests.
 */
export function registerChannels(channels: readonly PublishChannel[]): () => void {
  return setDeliveryPlanner((language, action) => planDeliveries(channels, language, action));
}
