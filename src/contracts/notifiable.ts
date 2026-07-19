/**
 * Recipient contract. A notifiable knows how to resolve its routing target for
 * a given channel (email address, user id, topic, phone number, etc.).
 */
import type { Notification } from './notification';

export interface Notifiable<TChannel extends string = string> {
  /** Discriminator for the recipient kind (for example 'user' or 'on_demand'). */
  readonly notifiableType: string;

  routeNotificationFor(
    channel: TChannel,
    notification: Notification<TChannel>,
  ): string | readonly string[];
}
