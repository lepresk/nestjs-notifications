/**
 * Abstract base class for notifications, in the spirit of Laravel's
 * notification classes.
 *
 * A notification declares its preference group, the channels it targets via
 * {@link via}, and a stable idempotency key per recipient. Channel-specific
 * payloads (mail body, database row, etc.) are defined by subclasses and read
 * by the matching {@link NotificationChannel} implementation, which keeps this
 * base free of any channel-specific shape.
 */
import type { Notifiable } from './notifiable';

export abstract class Notification<
  TChannel extends string = string,
  TGroup extends string = string,
> {
  /** Preference group consulted before {@link via} is filtered. */
  abstract preferenceGroup(): TGroup;

  /** Channels this notification wants to reach for the given recipient. */
  abstract via(notifiable: Notifiable<TChannel>): readonly TChannel[];

  /** Stable key used by channels for idempotent, per-recipient delivery. */
  abstract idempotencyKey(notifiable: Notifiable<TChannel>): string;

  /** When true, recipient preferences cannot suppress any channel. */
  isMandatory(): boolean {
    return false;
  }
}
