import { describe, expect, it, vi } from 'vitest';

import { ChannelManager } from '../src/channel-manager';
import {
  IMMEDIATE_AFTER_COMMIT_DISPATCHER,
  type AfterCommitDispatcher,
} from '../src/contracts/after-commit-dispatcher';
import { ALL_CHANNELS_ENABLED, channelPreferencesOf } from '../src/contracts/preferences';
import { NotificationSender } from '../src/notification-sender';
import {
  RecordingChannel,
  TestNotification,
  ThrowingChannel,
  staticResolver,
  user,
  type Channel,
} from './fixtures';

function buildSender(
  channels: readonly (RecordingChannel | ThrowingChannel)[],
  enabled: readonly Channel[],
  overrides: { afterCommitDispatcher?: AfterCommitDispatcher; logger?: { error: ReturnType<typeof vi.fn> } } = {},
): NotificationSender<Channel, 'transactions' | 'security'> {
  return new NotificationSender<Channel, 'transactions' | 'security'>({
    preferenceResolver: staticResolver(enabled),
    channelManager: new ChannelManager<Channel>(channels),
    ...overrides,
  });
}

describe('NotificationSender.send', () => {
  it('delivers only on channels enabled by preferences', async () => {
    const mail = new RecordingChannel('mail');
    const sms = new RecordingChannel('sms');
    const sender = buildSender([mail, sms], ['mail']);

    await sender.send([user], new TestNotification('transactions', ['mail', 'sms']));

    expect(mail.received).toHaveLength(1);
    expect(sms.received).toHaveLength(0);
  });

  it('ignores preferences for a mandatory notification', async () => {
    const mail = new RecordingChannel('mail');
    const sms = new RecordingChannel('sms');
    const sender = buildSender([mail, sms], []);

    await sender.send([user], new TestNotification('security', ['mail', 'sms'], true));

    expect(mail.received).toHaveLength(1);
    expect(sms.received).toHaveLength(1);
  });

  it('delivers to every recipient', async () => {
    const mail = new RecordingChannel('mail');
    const sender = buildSender([mail], ['mail']);
    const other = { ...user, notifiableType: 'admin' };

    await sender.send([user, other], new TestNotification('transactions', ['mail']));

    expect(mail.received).toHaveLength(2);
  });

  it('rejects when a channel fails', async () => {
    const sender = buildSender([new ThrowingChannel('mail')], ['mail']);

    await expect(
      sender.send([user], new TestNotification('transactions', ['mail'])),
    ).rejects.toThrow('channel mail failed');
  });

  it('rejects when a requested channel is not registered', async () => {
    const sender = buildSender([new RecordingChannel('mail')], ['sms']);

    await expect(
      sender.send([user], new TestNotification('security', ['sms'], true)),
    ).rejects.toThrow('Unknown notification channel: sms');
  });
});

describe('NotificationSender.sendInBackground', () => {
  it('resolves and logs instead of throwing on failure', async () => {
    const error = vi.fn();
    const sender = buildSender([new ThrowingChannel('mail')], ['mail'], { logger: { error } });

    await expect(
      sender.sendInBackground([user], new TestNotification('transactions', ['mail'])),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[1]).toContain('Background');
  });
});

describe('NotificationSender.sendAfterCommit', () => {
  it('registers the delivery with the dispatcher', async () => {
    const hooks: Array<() => Promise<void>> = [];
    const dispatcher: AfterCommitDispatcher = { register: (hook) => hooks.push(hook) };
    const mail = new RecordingChannel('mail');
    const sender = buildSender([mail], ['mail'], { afterCommitDispatcher: dispatcher });

    sender.sendAfterCommit([user], new TestNotification('transactions', ['mail']));
    expect(mail.received).toHaveLength(0);

    await hooks[0]?.();
    expect(mail.received).toHaveLength(1);
  });

  it('logs a deferred delivery failure instead of rejecting the hook', async () => {
    const error = vi.fn();
    const hooks: Array<() => Promise<void>> = [];
    const dispatcher: AfterCommitDispatcher = { register: (hook) => hooks.push(hook) };
    const sender = buildSender([new ThrowingChannel('mail')], ['mail'], {
      afterCommitDispatcher: dispatcher,
      logger: { error },
    });

    sender.sendAfterCommit([user], new TestNotification('transactions', ['mail']));
    await expect(hooks[0]?.()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[1]).toContain('After-commit');
  });

  it('runs immediately with the default dispatcher', async () => {
    const mail = new RecordingChannel('mail');
    const sender = buildSender([mail], ['mail']);

    sender.sendAfterCommit([user], new TestNotification('transactions', ['mail']));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mail.received).toHaveLength(1);
  });
});

describe('ChannelManager', () => {
  it('reports whether a channel is registered', () => {
    const manager = new ChannelManager<Channel>([new RecordingChannel('mail')]);

    expect(manager.has('mail')).toBe(true);
    expect(manager.has('sms')).toBe(false);
  });
});

describe('preferences helpers', () => {
  it('channelPreferencesOf enables only the listed channels', () => {
    const prefs = channelPreferencesOf<Channel>(['mail']);

    expect(prefs.isEnabled('mail')).toBe(true);
    expect(prefs.isEnabled('sms')).toBe(false);
  });

  it('ALL_CHANNELS_ENABLED enables everything', () => {
    expect(ALL_CHANNELS_ENABLED.isEnabled('anything')).toBe(true);
  });
});

describe('IMMEDIATE_AFTER_COMMIT_DISPATCHER', () => {
  it('runs the hook right away', async () => {
    const hook = vi.fn(async () => undefined);

    IMMEDIATE_AFTER_COMMIT_DISPATCHER.register(hook);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hook).toHaveBeenCalledOnce();
  });
});
