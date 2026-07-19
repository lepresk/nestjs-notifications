/**
 * The pluggable channel contract. A channel delivers a notification to a
 * recipient over one medium (mail, database/in-app, SMS, push, ...).
 */
import type { Notifiable } from './notifiable';
import type { Notification } from './notification';

export interface SendChannelInput<TChannel extends string = string> {
  readonly notifiable: Notifiable<TChannel>;
  readonly notification: Notification<TChannel>;
}

export interface NotificationChannel<TChannel extends string = string> {
  readonly id: TChannel;
  send(input: SendChannelInput<TChannel>): Promise<void>;
}
