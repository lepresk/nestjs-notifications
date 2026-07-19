import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../src/channel-manager';
import type { AfterCommitDispatcher } from '../src/contracts/after-commit-dispatcher';
import { NotificationSender } from '../src/notification-sender';
import { NotificationsModule } from '../src/notifications.module';
import {
  RecordingChannel,
  TestNotification,
  staticResolver,
  user,
  type Channel,
  type Group,
} from './fixtures';

describe('NotificationsModule.forRootAsync', () => {
  it('wires a working NotificationSender and ChannelManager', async () => {
    const mail = new RecordingChannel('mail');
    const moduleRef = await Test.createTestingModule({
      imports: [
        NotificationsModule.forRootAsync<Channel, Group>({
          channels: { useFactory: () => [mail] },
          preferenceResolver: { useFactory: () => staticResolver(['mail']) },
        }),
      ],
    }).compile();

    const manager = moduleRef.get<ChannelManager<Channel>>(ChannelManager);
    const sender = moduleRef.get<NotificationSender<Channel, Group>>(NotificationSender);

    expect(manager.has('mail')).toBe(true);

    await sender.send([user], new TestNotification('transactions', ['mail']));
    expect(mail.received).toHaveLength(1);
  });

  it('uses a provided after-commit dispatcher and logger', async () => {
    const hooks: Array<() => Promise<void>> = [];
    const dispatcher: AfterCommitDispatcher = { register: (hook) => hooks.push(hook) };
    const logger = { error: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [
        NotificationsModule.forRootAsync<Channel, Group>({
          channels: { useFactory: () => [new RecordingChannel('mail')] },
          preferenceResolver: { useFactory: () => staticResolver([]) },
          afterCommitDispatcher: { useFactory: () => dispatcher },
          logger,
          global: true,
        }),
      ],
    }).compile();

    const sender = moduleRef.get<NotificationSender<Channel, Group>>(NotificationSender);

    sender.sendAfterCommit([user], new TestNotification('security', ['mail'], true));
    expect(hooks).toHaveLength(1);

    await hooks[0]?.();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
