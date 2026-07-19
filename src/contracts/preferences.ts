/**
 * Preference resolution contract. Given a recipient and a notification's
 * preference group, the resolver returns which channels are currently enabled
 * for that recipient. The sender filters the notification's requested channels
 * through this result unless the notification is mandatory.
 */
import type { Notifiable } from './notifiable';

export interface ChannelPreferences<TChannel extends string = string> {
  isEnabled(channel: TChannel): boolean;
}

export interface NotificationPreferenceResolver<
  TChannel extends string = string,
  TGroup extends string = string,
> {
  resolve(
    notifiable: Notifiable<TChannel>,
    group: TGroup,
  ): Promise<ChannelPreferences<TChannel>>;
}

/** Builds a {@link ChannelPreferences} from an explicit set of enabled channels. */
export function channelPreferencesOf<TChannel extends string>(
  enabled: Iterable<TChannel>,
): ChannelPreferences<TChannel> {
  const set = new Set(enabled);
  return { isEnabled: (channel): boolean => set.has(channel) };
}

/** A {@link ChannelPreferences} where every channel is enabled. */
export const ALL_CHANNELS_ENABLED: ChannelPreferences = {
  isEnabled: (): boolean => true,
};
