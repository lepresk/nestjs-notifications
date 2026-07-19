/**
 * Routes a channel id to its registered {@link NotificationChannel}.
 */
import type { NotificationChannel, SendChannelInput } from './contracts/notification-channel';

export class ChannelManager<TChannel extends string = string> {
  private readonly channels: ReadonlyMap<TChannel, NotificationChannel<TChannel>>;

  constructor(channels: readonly NotificationChannel<TChannel>[]) {
    this.channels = new Map(channels.map((channel) => [channel.id, channel]));
  }

  has(channelId: TChannel): boolean {
    return this.channels.has(channelId);
  }

  async send(channelId: TChannel, input: SendChannelInput<TChannel>): Promise<void> {
    const channel = this.channels.get(channelId);
    if (channel === undefined) {
      throw new Error(`Unknown notification channel: ${channelId}`);
    }
    await channel.send(input);
  }
}
