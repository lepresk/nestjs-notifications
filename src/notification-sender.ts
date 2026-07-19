/**
 * Central entry point for dispatching notifications. It resolves recipient
 * preferences, filters the notification's requested channels, and fans out to
 * every surviving channel.
 *
 * {@link NotificationSender.send} rejects on the first delivery error so an
 * awaiting caller can react. The fire-and-forget variants,
 * {@link NotificationSender.sendInBackground} and
 * {@link NotificationSender.sendAfterCommit}, swallow and log failures so a
 * business flow is never blocked by notification delivery.
 */
import { ChannelManager } from './channel-manager';
import {
  IMMEDIATE_AFTER_COMMIT_DISPATCHER,
  type AfterCommitDispatcher,
} from './contracts/after-commit-dispatcher';
import type { Notifiable } from './contracts/notifiable';
import type { Notification } from './contracts/notification';
import type { NotificationPreferenceResolver } from './contracts/preferences';

export interface NotificationLogger {
  error(error: unknown, message: string): void;
}

const NOOP_LOGGER: NotificationLogger = {
  error(): void {
    // intentionally silent
  },
};

export interface NotificationSenderOptions<
  TChannel extends string = string,
  TGroup extends string = string,
> {
  readonly preferenceResolver: NotificationPreferenceResolver<TChannel, TGroup>;
  readonly channelManager: ChannelManager<TChannel>;
  readonly afterCommitDispatcher?: AfterCommitDispatcher;
  readonly logger?: NotificationLogger;
}

export class NotificationSender<
  TChannel extends string = string,
  TGroup extends string = string,
> {
  private readonly preferenceResolver: NotificationPreferenceResolver<TChannel, TGroup>;
  private readonly channelManager: ChannelManager<TChannel>;
  private readonly afterCommitDispatcher: AfterCommitDispatcher;
  private readonly logger: NotificationLogger;

  constructor(options: NotificationSenderOptions<TChannel, TGroup>) {
    this.preferenceResolver = options.preferenceResolver;
    this.channelManager = options.channelManager;
    this.afterCommitDispatcher =
      options.afterCommitDispatcher ?? IMMEDIATE_AFTER_COMMIT_DISPATCHER;
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  /**
   * Resolves preferences and delivers on every surviving channel. Rejects on
   * the first delivery or resolution error.
   */
  async send(
    notifiables: readonly Notifiable<TChannel>[],
    notification: Notification<TChannel, TGroup>,
  ): Promise<void> {
    await Promise.all(
      notifiables.map((notifiable) => this.dispatchToNotifiable(notifiable, notification)),
    );
  }

  /** Dispatches without blocking the caller; failures are logged, not thrown. */
  sendInBackground(
    notifiables: readonly Notifiable<TChannel>[],
    notification: Notification<TChannel, TGroup>,
  ): Promise<void> {
    return this.send(notifiables, notification).catch((error: unknown) => {
      this.logger.error(error, 'Background notification dispatch failed');
    });
  }

  /**
   * Defers delivery to the after-commit dispatcher. Failures are logged, not
   * thrown, so an unhandled rejection can never escape the dispatcher.
   */
  sendAfterCommit(
    notifiables: readonly Notifiable<TChannel>[],
    notification: Notification<TChannel, TGroup>,
  ): void {
    this.afterCommitDispatcher.register(async () => {
      try {
        await this.send(notifiables, notification);
      } catch (error) {
        this.logger.error(error, 'After-commit notification dispatch failed');
      }
    });
  }

  private async dispatchToNotifiable(
    notifiable: Notifiable<TChannel>,
    notification: Notification<TChannel, TGroup>,
  ): Promise<void> {
    const channels = await this.resolveChannels(notifiable, notification);
    await Promise.all(
      channels.map((channelId) =>
        this.channelManager.send(channelId, { notifiable, notification }),
      ),
    );
  }

  private async resolveChannels(
    notifiable: Notifiable<TChannel>,
    notification: Notification<TChannel, TGroup>,
  ): Promise<readonly TChannel[]> {
    const requested = notification.via(notifiable);
    if (notification.isMandatory()) {
      return requested;
    }
    const prefs = await this.preferenceResolver.resolve(
      notifiable,
      notification.preferenceGroup(),
    );
    return requested.filter((channelId) => prefs.isEnabled(channelId));
  }
}
