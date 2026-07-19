import { Notification } from '../src/contracts/notification';
import type { Notifiable } from '../src/contracts/notifiable';
import type { NotificationChannel, SendChannelInput } from '../src/contracts/notification-channel';
import {
  channelPreferencesOf,
  type ChannelPreferences,
  type NotificationPreferenceResolver,
} from '../src/contracts/preferences';

export type Channel = 'mail' | 'database' | 'sms';
export type Group = 'transactions' | 'security';

export class TestNotification extends Notification<Channel, Group> {
  constructor(
    private readonly group: Group,
    private readonly channels: readonly Channel[],
    private readonly mandatory = false,
  ) {
    super();
  }

  preferenceGroup(): Group {
    return this.group;
  }

  via(): readonly Channel[] {
    return this.channels;
  }

  idempotencyKey(notifiable: Notifiable<Channel>): string {
    return `${notifiable.notifiableType}:${this.group}`;
  }

  override isMandatory(): boolean {
    return this.mandatory;
  }
}

export const user: Notifiable<Channel> = {
  notifiableType: 'user',
  routeNotificationFor: (channel): string =>
    channel === 'mail' ? 'user@example.com' : 'user-1',
};

export class RecordingChannel implements NotificationChannel<Channel> {
  readonly received: SendChannelInput<Channel>[] = [];

  constructor(readonly id: Channel) {}

  async send(input: SendChannelInput<Channel>): Promise<void> {
    this.received.push(input);
  }
}

export class ThrowingChannel implements NotificationChannel<Channel> {
  constructor(readonly id: Channel) {}

  async send(): Promise<void> {
    throw new Error(`channel ${this.id} failed`);
  }
}

export function staticResolver(
  enabled: readonly Channel[],
): NotificationPreferenceResolver<Channel, Group> {
  return {
    resolve: async (): Promise<ChannelPreferences<Channel>> => channelPreferencesOf(enabled),
  };
}
