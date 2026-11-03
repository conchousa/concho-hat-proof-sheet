# Concho Proof Builder

Web app Noah uses to build a hat proof sheet and click **Ready**. Ready uploads the PDF to the HubSpot deal, adds a "Proof v{round} ready" note, sets `design_approval_status` to `mockups_sent_to_customer`, bumps `design_round`, and creates a task for the deal owner.

After that HubSpot work succeeds, the app emails Jake that new designs are ready. The message goes only to `READY_NOTIFY_EMAIL` (default `jake@conchousa.com`). It includes the deal name, proof round, and a HubSpot deal link. It does not email the customer. If Resend is not configured, or the send fails, Ready still returns success and the failure is logged.

Live service: [concho-proof-builder](https://concho-proof-builder.onrender.com) (`concho-proof-builder` on Render).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `HUBSPOT_PROOF_BUILDER_TOKEN` | yes | HubSpot private-app token for deal, file, note, and task calls |
| `PORT` | set by Render | HTTP port. Local default is 3000 |
| `PUBLIC_URL` | no | Origin used when backfilling `proof_builder_link`. Defaults to the Render URL |
| `READY_NOTIFY_EMAIL` | no | Ready notification inbox. Defaults to `jake@conchousa.com` |
| `READY_NOTIFY_FROM` | to send mail | Verified Resend from address, for example `Concho Proof Builder <proofs@conchousa.com>` |
| `RESEND_API_KEY` | to send mail | [Resend](https://resend.com/api-keys) API key. The sending domain must be verified |
| `HUBSPOT_PORTAL_ID` | no | Portal id in the deal link. Defaults to `246719359` |

Do not commit real keys. `.env.example` has empty placeholders.

On Render, add `RESEND_API_KEY` and `READY_NOTIFY_FROM` to the **concho-proof-builder** service environment. Render restarts the service when environment variables change. Leave the values out of git.

If this service is later described in a Blueprint, keep secrets out of the YAML with `sync: false` (the value is entered in the Dashboard and is not overwritten from the file):

```yaml
services:
  - type: web
    name: concho-proof-builder
    runtime: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: HUBSPOT_PROOF_BUILDER_TOKEN
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: READY_NOTIFY_FROM
        sync: false
      - key: READY_NOTIFY_EMAIL
        value: jake@conchousa.com
      - key: HUBSPOT_PORTAL_ID
        value: "246719359"
      - key: PUBLIC_URL
        value: https://concho-proof-builder.onrender.com
```

`onboarding@resend.dev` only delivers to the Resend account owner. Use a sender on a domain verified in Resend so mail to `jake@conchousa.com` is accepted.

## Run

```bash
npm install
npm start
```

## Tests

```bash
npm test
```

Unit tests cover the email contents, the default recipient, env overrides, and soft failures (missing config, Resend HTTP errors, network errors). They do not call HubSpot or Resend.

### Manual check against a real deal

1. Set `HUBSPOT_PROOF_BUILDER_TOKEN`, `RESEND_API_KEY`, and `READY_NOTIFY_FROM` in the environment (local or Render). Do not put those values in git.
2. Open a deal in the proof builder and click **Ready** with at least one design, or POST a PDF:

```bash
curl -F pdf=@proof.pdf http://localhost:3000/api/deal/DEAL_ID/ready
```

3. Expect `{"ok":true,...}`. HubSpot should still have the file, the "Proof vN ready" note, `mockups_sent_to_customer`, the bumped `design_round`, and the owner task.
4. `READY_NOTIFY_EMAIL` should receive one message. Subject: `Noah has new designs ready: {deal name}`. Body: deal name, `Proof round: vN`, link `https://app.hubspot.com/contacts/246719359/record/0-3/{deal id}`, and a line that the PDF is on the Proof ready note. No customer address is included.
5. The server log should include `Ready email sent to jake@conchousa.com`.
6. Unset `RESEND_API_KEY` and repeat. Ready still returns `ok: true` and the log says `Ready email skipped`.
