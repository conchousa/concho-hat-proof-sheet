# Concho Proof Builder

Web app Noah uses to build a hat proof sheet and click **Ready**. Ready uploads the PDF to the HubSpot deal, adds a note, sets `design_approval_status` to `mockups_sent_to_customer`, bumps `design_round`, and creates a task.

The note @mentions **Jake Connell** (HubSpot owner id `95247148`). The task is assigned to Jake, not to the deal owner. No extra email service or env vars are required. Customer addresses are not emailed.

Live service: [concho-proof-builder](https://concho-proof-builder.onrender.com) (`concho-proof-builder` on Render).

## Mention format

Copied from notes created in this portal’s CRM UI (for example note `414889596624`, source `CRM_UI`). The chip HubSpot renders as an @mention is:

```html
<span data-mention-id="95247148" data-mention-name="Jake Connell" style="color: #425b76;font-weight: 600;">@Jake Connell</span>
```

The Ready note is:

```html
<div style="" dir="auto" data-top-level="true"><p style="margin:0;"><strong>Proof v{round} ready</strong></p><p style="margin:0;">{mention} Mockup proof sheet attached (Concho Proof Builder).</p></div>
```

The create request also sets `hs_at_mentioned_owner_ids` to `95247148` (HubSpot’s “At-Mentioned Owner Ids” field, semicolon-separated when there is more than one). If HubSpot rejects that property, Ready saves the note again with the same mention markup and no other change.

The task sets `hubspot_owner_id` to `95247148`.

HubSpot’s help article [Mention a user on a record](https://knowledge.hubspot.com/records/mention-a-user-on-a-record) (updated August 11, 2026) says a mentioned user is notified the first time they are mentioned on an activity, and that **activities created via API do not send that mention notification**. Their CRM product manager confirmed in July 2026 that API note mentions still do not notify. The markup above is still what the CRM UI writes. Assigning the task is the part that can email Jake when his HubSpot task notifications are on.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `HUBSPOT_PROOF_BUILDER_TOKEN` | yes | HubSpot private-app token already used by deal reads and Ready |
| `PORT` | set by Render | HTTP port. Local default is 3000 |
| `PUBLIC_URL` | no | Origin used when backfilling `proof_builder_link`. Defaults to the Render URL |
| `RESEND_API_KEY` | no | Optional extra email. Ignored unless `READY_NOTIFY_FROM` is also set |
| `READY_NOTIFY_FROM` | no | Verified Resend sender. Both this and the API key must be set or Resend does nothing |
| `READY_NOTIFY_EMAIL` | no | Optional Resend inbox. Defaults to `jake@conchousa.com` |
| `HUBSPOT_PORTAL_ID` | no | Portal id in the optional Resend link. Defaults to `246719359` |

Ready notifies Jake through HubSpot with the token the service already has. Leave Resend unset.

## Run

```bash
npm install
npm start
```

## Tests

```bash
npm test
```

Unit tests check the mention span, `hs_at_mentioned_owner_ids`, task assignment to owner `95247148`, and that a Resend failure cannot fail Ready. They do not call HubSpot.

### Verify on deal 361327562441

1. Deploy this build (no new Render env vars).
2. Open `https://concho-proof-builder.onrender.com/?deal=361327562441`, add a design, and click **Ready**. Or POST a PDF to `/api/deal/361327562441/ready`.
3. Expect `{"ok":true,...,"mentionedOwnerId":"95247148","taskOwnerId":"95247148"}`.
4. On the deal timeline, the new note should show **Proof vN ready**, a blue **@Jake Connell** chip (not plain text), and the PDF. `GET /crm/v3/objects/notes/{noteId}?properties=hs_note_body,hs_at_mentioned_owner_ids` should contain `data-mention-id="95247148"` and `hs_at_mentioned_owner_ids` of `95247148`.
5. The **Designs ready** task should be assigned to Jake Connell.
6. Jake should check HubSpot email and the notification bell. A task-assigned email depends on his notification settings. A mention email is what the CRM UI sends for the same chip; HubSpot’s own docs say an activity created through the API does not send that mention email. If the chip is right and the email does not arrive, that is the API limitation above, not a missing Resend key.
