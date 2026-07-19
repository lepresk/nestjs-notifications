# @lepresk/nestjs-notifications

[![CI](https://github.com/lepresk/nestjs-notifications/actions/workflows/ci.yml/badge.svg)](https://github.com/lepresk/nestjs-notifications/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@lepresk/nestjs-notifications.svg)](https://www.npmjs.com/package/@lepresk/nestjs-notifications)
[![node](https://img.shields.io/node/v/@lepresk/nestjs-notifications.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/npm/l/@lepresk/nestjs-notifications.svg)](./LICENSE)

A small, type-safe notification engine for NestJS, in the spirit of Laravel
notifications.

A notification declares which channels it targets and its preference group. The
sender resolves the recipient's preferences, filters the channels, and fans out
to each one. Channels are pluggable, delivery can be deferred until after your
database transaction commits, and everything is generic over your own channel
and preference-group types, so no string is untyped.

- **Pluggable channels.** Implement `NotificationChannel` for mail, in-app, SMS, push, or anything else.
- **Preference-aware.** A `NotificationPreferenceResolver` decides which channels a recipient currently accepts. Mandatory notifications bypass it.
- **Three delivery modes.** `send` (awaitable, throws on failure), `sendInBackground` (fire-and-forget, logs failures), `sendAfterCommit` (deferred to a commit hook).
- **Fully generic.** `Notification<TChannel, TGroup>` and friends are parameterized by your own union types.
- **Bring your own everything.** Channels, preference storage, and the after-commit mechanism are injected. The package ships the orchestration, not the infrastructure.

## Install

```bash
pnpm add @lepresk/nestjs-notifications
```

`@nestjs/common` is a peer dependency (`>=10`).

## Concepts

Define your channel ids and preference groups as unions, then type everything
against them:

```ts
type Channel = 'mail' | 'database' | 'sms';
type Group = 'transactions' | 'security';
```

### 1. A notification

```ts
import { Notification, type Notifiable } from '@lepresk/nestjs-notifications';

export class OrderShippedNotification extends Notification<Channel, Group> {
  constructor(private readonly orderId: string) {
    super();
  }

  preferenceGroup(): Group {
    return 'transactions';
  }

  via(): readonly Channel[] {
    return ['mail', 'database'];
  }

  idempotencyKey(notifiable: Notifiable<Channel>): string {
    return `order-shipped:${this.orderId}:${notifiable.notifiableType}`;
  }

  // Channel payloads live on the notification and are read by your channels.
  toMail(): { subject: string; body: string } {
    return { subject: 'Your order shipped', body: `Order ${this.orderId} is on its way.` };
  }
}
```

### 2. A channel

```ts
import type { NotificationChannel, SendChannelInput } from '@lepresk/nestjs-notifications';

export class MailChannel implements NotificationChannel<Channel> {
  readonly id = 'mail' as const;

  constructor(private readonly mailer: Mailer) {}

  async send({ notifiable, notification }: SendChannelInput<Channel>): Promise<void> {
    const to = notifiable.routeNotificationFor('mail', notification);
    const mail = (notification as OrderShippedNotification).toMail();
    await this.mailer.send({ to, ...mail });
  }
}
```

### 3. A preference resolver

```ts
import {
  channelPreferencesOf,
  type ChannelPreferences,
  type NotificationPreferenceResolver,
} from '@lepresk/nestjs-notifications';

export class PreferenceResolver implements NotificationPreferenceResolver<Channel, Group> {
  constructor(private readonly repo: PreferenceRepository) {}

  async resolve(notifiable: Notifiable<Channel>, group: Group): Promise<ChannelPreferences<Channel>> {
    const enabled = await this.repo.enabledChannels(notifiable, group);
    return channelPreferencesOf(enabled);
  }
}
```

### 4. Wire the module

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '@lepresk/nestjs-notifications';

@Module({
  imports: [
    NotificationsModule.forRootAsync<Channel, Group>({
      channels: {
        imports: [MailModule],
        inject: [Mailer, InAppRepository],
        useFactory: (mailer: Mailer, repo: InAppRepository) => [
          new MailChannel(mailer),
          new DatabaseChannel(repo),
        ],
      },
      preferenceResolver: {
        inject: [PreferenceRepository],
        useFactory: (repo: PreferenceRepository) => new PreferenceResolver(repo),
      },
    }),
  ],
})
export class AppModule {}
```

### 5. Send

```ts
import { NotificationSender } from '@lepresk/nestjs-notifications';

@Injectable()
export class OrderService {
  constructor(private readonly notifications: NotificationSender<Channel, Group>) {}

  async ship(order: Order): Promise<void> {
    await this.doShip(order);
    this.notifications.sendInBackground([toNotifiable(order.customer)], new OrderShippedNotification(order.id));
  }
}
```

## Deferring delivery until commit

Notifying from inside a transaction is unsafe: it can still roll back. Provide an
`afterCommitDispatcher` and use `sendAfterCommit`. It composes cleanly with
[`@lepresk/after-commit`](https://github.com/lepresk/after-commit):

```ts
import { registerAfterCommitHook } from '@lepresk/after-commit';

NotificationsModule.forRootAsync<Channel, Group>({
  channels: { /* ... */ },
  preferenceResolver: { /* ... */ },
  afterCommitDispatcher: {
    useFactory: () => ({ register: (hook) => registerAfterCommitHook(hook) }),
  },
});
```

```ts
// Inside runWithAfterCommitContext(...), this fires only after the transaction commits.
this.notifications.sendAfterCommit([recipient], new OrderShippedNotification(order.id));
```

With no dispatcher configured, `sendAfterCommit` delivers immediately.

## API

| Export | Description |
| ------ | ----------- |
| `Notification<TChannel, TGroup>` | Abstract base: `preferenceGroup()`, `via()`, `idempotencyKey()`, `isMandatory()`. |
| `Notifiable<TChannel>` | Recipient: `notifiableType` plus `routeNotificationFor(channel, notification)`. |
| `NotificationChannel<TChannel>` | Pluggable channel: `id` plus `send({ notifiable, notification })`. |
| `NotificationPreferenceResolver<TChannel, TGroup>` | Resolves enabled channels per recipient and group. |
| `channelPreferencesOf(enabled)` / `ALL_CHANNELS_ENABLED` | Build a `ChannelPreferences`. |
| `NotificationSender<TChannel, TGroup>` | `send`, `sendInBackground`, `sendAfterCommit`. |
| `ChannelManager<TChannel>` | Routes a channel id to its channel; `has(id)`. |
| `AfterCommitDispatcher` | Strategy for deferring delivery to a commit hook. |
| `NotificationsModule.forRootAsync(options)` | NestJS dynamic module wiring the above. |

### Delivery semantics

- `send` rejects on the first delivery or resolution error.
- `sendInBackground` never rejects; failures go to the configured logger.
- `sendAfterCommit` defers to the dispatcher and logs failures rather than leaking an unhandled rejection.
- A mandatory notification (`isMandatory() === true`) skips preference filtering.

## Requirements

- NestJS `>=10`
- Node.js `>=18.18`

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm build
```

## License

[MIT](./LICENSE)
