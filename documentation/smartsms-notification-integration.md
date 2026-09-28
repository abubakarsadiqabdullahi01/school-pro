# SmartSMSSolutions notification integration

## Status

SchoolPro now supports SmartSMSSolutions for both SMS and transactional email. Messages use the existing durable notification outbox, so a provider outage does not undo a successful school-fee payment or block result publication.

The API token shown in a screenshot is exposed. Revoke it in **Developer Tools > API Tokens**, create a replacement, and never put the replacement in documentation, chat, source control, or a browser screenshot.

## Provider configuration

Add these values only to the server environment (`.env.local` locally and the protected cPanel environment in production):

```dotenv
SMARTSMS_API_TOKEN=<new-token>
SMARTSMS_SENDER_ID=<approved-sender-id>
SMARTSMS_SMS_ROUTING=3
SMARTSMS_EMAIL_WEBHOOK_SECRET=<long-random-webhook-secret>
```

`SMARTSMS_API_TOKEN` is server-only. There is intentionally no `NEXT_PUBLIC_` version.

Routing `3` uses the provider's basic route plus its corporate route for DND numbers. The sender ID must be approved by the provider before production sending. Email also requires the provider-side sending identity/domain setup.

## Application behaviour

- SMS endpoint: `POST https://app.smartsmssolutions.com/io/api/client/v1/sms/`
- Email endpoint: `POST https://app.smartsmssolutions.com/io/api/client/v1/email/send/`
- Nigerian phone numbers are normalized once when queued and sent without the leading `+`.
- SMS success requires provider code `1000`.
- Email success requires `status=success` and a provider message ID.
- Provider errors remain in the outbox and retry with bounded exponential backoff.
- Dedupe keys prevent repeated result, fee, or payment notifications.
- Payment posting and notification queueing are separate from provider delivery. A notification failure cannot reverse or duplicate a payment.
- SmartSMS delivery status is reconciled by webhook and by status polling because provider webhooks are at-most-once.

## Email webhook

In the SmartSMSSolutions dashboard, register:

```text
https://schoolpro.digisoft.com.ng/api/webhooks/smartsms/email
```

Enable delivery and bounce events. Complaint and unsubscribe events may also be enabled for provider-side suppression. Open and click tracking are optional and are not used as proof of delivery.

Use the same secret as `SMARTSMS_EMAIL_WEBHOOK_SECRET`. SchoolPro verifies `X-SmartSMS-Signature` as HMAC-SHA256 over `timestamp + "." + raw_body`, rejects timestamps older than five minutes, caps the request body, and uses timing-safe comparison.

The endpoint acknowledges valid events quickly. Delivery moves a sent email to delivered; bounce moves it to failed. Duplicate and out-of-order events are safe.

## Worker schedule

Run the outbox worker from the protected scheduler/cron:

```powershell
npx tsx scripts/drain-notification-outbox.ts
```

A five-minute schedule is suitable initially. The worker releases stale claims, sends due messages, and reconciles older SmartSMS email statuses without resending them.

## Safe test sequence

1. Revoke the exposed token and create a new restricted token.
2. Obtain an approved SMS sender ID and configure the email sending domain/identity.
3. Add the four environment values locally; restart the application.
4. Queue one SMS to a controlled Nigerian test number and one email to a controlled inbox.
5. Run the worker once and confirm the outbox records provider IDs rather than `log`.
6. Confirm SMS receipt, email receipt, and email delivery status.
7. Send a correctly signed webhook fixture, then replay it; the second delivery must not create another message or change a payment.
8. Send invalid-signature and stale-timestamp fixtures; both must be rejected.
9. Simulate a provider failure and confirm the business operation remains successful while the notification retries.
10. Only after those checks, configure the protected production environment and provider webhook URL.

## Notifications to add through the outbox

- Successful or reversed school-fee payment
- Receipt ready
- Fee balance reminder and overdue notice
- Result published/available
- Attendance or important school announcement
- Password/account recovery security message

Do not send sensitive result details, full financial records, passwords, API tokens, or payment-card data in SMS. Send a short notice and a secure portal link instead.

## Operational controls

- Provide each school with notification enable/disable settings and per-event channel preferences.
- Keep one platform-owned provider credential centrally; do not expose it to schools.
- Record recipient, template/event, segment count, provider ID, status, attempts, and timestamps.
- Respect opt-out/suppression rules for non-essential notices while retaining legally or operationally essential messages.
- Monitor queued, retrying, failed, bounced, complained, and delivered totals.
- Set a monthly SMS budget/limit per school before enabling bulk announcements.

## Official references

- [SmartSMSSolutions API documentation](https://developer.smartsmssolutions.com/)
- [SmartSMSSolutions SMS API section](https://developer.smartsmssolutions.com/#60f3d5e9-e2db-46a0-8659-21771936fe0c)
