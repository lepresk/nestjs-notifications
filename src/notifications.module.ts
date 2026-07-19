/**
 * NestJS dynamic module that wires a {@link NotificationSender} and
 * {@link ChannelManager} from consumer-provided channels, a preference
 * resolver, and an optional after-commit dispatcher.
 */
import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';

import { ChannelManager } from './channel-manager';
import {
  IMMEDIATE_AFTER_COMMIT_DISPATCHER,
  type AfterCommitDispatcher,
} from './contracts/after-commit-dispatcher';
import type { NotificationChannel } from './contracts/notification-channel';
import type { NotificationPreferenceResolver } from './contracts/preferences';
import { NotificationSender, type NotificationLogger } from './notification-sender';
import {
  AFTER_COMMIT_DISPATCHER,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCE_RESOLVER,
} from './tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the NestJS FactoryProvider signature
type FactoryFn<T> = (...args: any[]) => T | Promise<T>;

export interface NotificationsAsyncProvider<T> {
  readonly imports?: ModuleMetadata['imports'];
  readonly inject?: FactoryProvider['inject'];
  readonly useFactory: FactoryFn<T>;
}

export interface NotificationsModuleAsyncOptions<
  TChannel extends string = string,
  TGroup extends string = string,
> {
  readonly channels: NotificationsAsyncProvider<readonly NotificationChannel<TChannel>[]>;
  readonly preferenceResolver: NotificationsAsyncProvider<
    NotificationPreferenceResolver<TChannel, TGroup>
  >;
  readonly afterCommitDispatcher?: NotificationsAsyncProvider<AfterCommitDispatcher>;
  readonly logger?: NotificationLogger;
  readonly global?: boolean;
}

@Module({})
export class NotificationsModule {
  static forRootAsync<TChannel extends string = string, TGroup extends string = string>(
    options: NotificationsModuleAsyncOptions<TChannel, TGroup>,
  ): DynamicModule {
    const channelsProvider: Provider = {
      provide: NOTIFICATION_CHANNELS,
      useFactory: options.channels.useFactory,
      inject: options.channels.inject ?? [],
    };

    const resolverProvider: Provider = {
      provide: NOTIFICATION_PREFERENCE_RESOLVER,
      useFactory: options.preferenceResolver.useFactory,
      inject: options.preferenceResolver.inject ?? [],
    };

    const dispatcherProvider: Provider =
      options.afterCommitDispatcher !== undefined
        ? {
            provide: AFTER_COMMIT_DISPATCHER,
            useFactory: options.afterCommitDispatcher.useFactory,
            inject: options.afterCommitDispatcher.inject ?? [],
          }
        : { provide: AFTER_COMMIT_DISPATCHER, useValue: IMMEDIATE_AFTER_COMMIT_DISPATCHER };

    const channelManagerProvider: Provider = {
      provide: ChannelManager,
      useFactory: (channels: readonly NotificationChannel<TChannel>[]): ChannelManager<TChannel> =>
        new ChannelManager<TChannel>(channels),
      inject: [NOTIFICATION_CHANNELS],
    };

    const logger = options.logger;
    const senderProvider: Provider = {
      provide: NotificationSender,
      useFactory: (
        preferenceResolver: NotificationPreferenceResolver<TChannel, TGroup>,
        channelManager: ChannelManager<TChannel>,
        afterCommitDispatcher: AfterCommitDispatcher,
      ): NotificationSender<TChannel, TGroup> =>
        new NotificationSender<TChannel, TGroup>({
          preferenceResolver,
          channelManager,
          afterCommitDispatcher,
          ...(logger !== undefined ? { logger } : {}),
        }),
      inject: [NOTIFICATION_PREFERENCE_RESOLVER, ChannelManager, AFTER_COMMIT_DISPATCHER],
    };

    const imports: ModuleMetadata['imports'] = [
      ...(options.channels.imports ?? []),
      ...(options.preferenceResolver.imports ?? []),
      ...(options.afterCommitDispatcher?.imports ?? []),
    ];

    return {
      module: NotificationsModule,
      global: options.global ?? false,
      imports,
      providers: [
        channelsProvider,
        resolverProvider,
        dispatcherProvider,
        channelManagerProvider,
        senderProvider,
      ],
      exports: [NotificationSender, ChannelManager],
    };
  }
}
