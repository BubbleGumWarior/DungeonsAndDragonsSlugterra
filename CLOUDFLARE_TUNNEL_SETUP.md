# Cloudflare Tunnel setup (one-time)

This replaces port-forwarding + self-signed certs with a Cloudflare Tunnel,
using the `dungeonlair.co.za` domain (bought via Xneelo). `cloudflared` is
already installed on this PC (checked: v2026.8.2). Run these yourself in a
terminal — the login/DNS steps are tied to your own Xneelo and Cloudflare
accounts, so I can't run them for you.

**Do step 0 first.** As of this writing, `dungeonlair.co.za`'s nameservers
are still Xneelo's own (`ns1/2.dns-h.com`, `ns1/2.host-h.net`) — confirmed
via `nslookup -type=ns dungeonlair.co.za`. Cloudflare Tunnel needs Cloudflare
to be the domain's actual DNS authority, so `cloudflared tunnel login`'s
zone picker won't find `dungeonlair.co.za` until that's moved over.

## 0. Move DNS from Xneelo to Cloudflare

The domain currently also has an `MX` record (`mail.dungeonlair.co.za`) —
leftover mail routing from Xneelo. Since no mailing service will be
integrated going forward, this guide doesn't preserve it: after the switch,
email to `@dungeonlair.co.za` will simply stop working unless you
deliberately re-add mail records in Cloudflare later. If that ever matters,
note down the current `MX`/`TXT` records from Xneelo's panel before you
start — otherwise skip straight past that.

1. **Add the site to Cloudflare.** `dash.cloudflare.com` → **Add a Site** →
   `dungeonlair.co.za` → Free plan. Cloudflare scans the domain via its
   current (Xneelo) nameservers and auto-imports whatever DNS records it
   finds.
2. **Check the import.** Open the new zone's **DNS → Records** tab and
   confirm this one is present and correct — it's the only record that
   actually matters, since the live campaign depends on it:
   - `www` → **CNAME** → `q7b99oiv.up.railway.app`
   If it's missing, add it manually. Also set it to **"DNS only" (grey
   cloud, not orange)** — that keeps traffic going straight to Railway
   exactly as it does today; Cloudflare only becomes the DNS *authority*
   here, not an active proxy in front of the live site. You can ignore/
   delete the `MX`/mail-related records Cloudflare may have imported, since
   they won't be kept working (see above).
3. **Get the assigned nameservers.** Cloudflare shows two nameservers on
   this same "Add a Site" flow — for this domain, they are:
   - `titan.ns.cloudflare.com`
   - `ximena.ns.cloudflare.com`
4. **Check DNSSEC at Xneelo first.** If it's enabled for the domain, turn it
   off before switching nameservers — a stale DS record at the registry
   pointing at keys the old (Xneelo) nameservers used will break DNS
   resolution entirely once Cloudflare's nameservers (which don't have
   those keys) take over. If there's no DNSSEC toggle visible in Xneelo's
   panel, it's not enabled and this doesn't apply.
5. **Switch nameservers at Xneelo.** Log into Xneelo's control panel → the
   domain's nameserver/DNS settings → add the two Cloudflare nameservers
   from step 3, remove the current four (`ns1/2.dns-h.com`,
   `ns1/2.host-h.net`), save.
6. **Wait for it to go Active.** Cloudflare's dashboard shows "Pending
   Nameserver Update" until it detects the switch — usually well under an
   hour, occasionally longer. Don't start this right before a game session;
   pick a day with slack in case anything needs a second look.
6. **Verify the live site still works.** Reload `https://www.dungeonlair.co.za`
   — it should look identical, still served by Railway, since step 2 kept
   that record as a plain unproxied CNAME.

Once the zone shows **Active** in Cloudflare, continue with step 1 below —
`cloudflared tunnel login` should now find `dungeonlair.co.za`.

## 1. Log in

```bash
cloudflared tunnel login
```

Opens a browser, asks you to pick a zone — choose **dungeonlair.co.za**.
This drops a certificate at `%USERPROFILE%\.cloudflared\cert.pem` that
authorizes this machine to manage tunnels for that domain.

## 2. Create the tunnel

```bash
cloudflared tunnel create dungeonlair
```

Prints a tunnel ID (a UUID) and writes credentials to
`%USERPROFILE%\.cloudflared\<UUID>.json`. Copy that UUID — you need it below.

## 3. Point a subdomain at it

```bash
cloudflared tunnel route dns dungeonlair play.dungeonlair.co.za
```

This creates the DNS record in Cloudflare automatically (a CNAME to
`<UUID>.cfargotunnel.com`). Feel free to swap `play` for whatever subdomain
you'd rather use — just keep it consistent with step 4 and `run_tunnel.bat`.

## 4. Write the config file

Create `%USERPROFILE%\.cloudflared\config.yml` with:

```yaml
tunnel: dungeonlair
credentials-file: C:\Users\sebas\.cloudflared\<UUID>.json

ingress:
  - hostname: play.dungeonlair.co.za
    service: http://localhost:5173
  - service: http_status:404
```

Replace `<UUID>` with the value from step 2. `service` points at plain
`http://localhost:5173` (not https) — the client's Vite dev server no
longer serves HTTPS itself (see the comment in `client/vite.config.js`),
since Cloudflare now handles that at the edge with a real cert.

## 5. Run it

```bash
run_tunnel.bat
```

Starts the server, client, and `cloudflared tunnel run dungeonlair` in three
windows. Once all three windows settle, everyone (including you, from any
network) connects at `https://play.dungeonlair.co.za` — no port forwarding,
no router changes, no cert warnings.

## Coexisting with the live Railway site (current campaign)

Railway currently serves the **live campaign** at `www.dungeonlair.co.za`.
This setup uses `play.dungeonlair.co.za` instead — a different hostname —
so there's no clash today. You can set up and test the tunnel right now,
mid-campaign, without touching Railway at all:

- `run.bat` — pure `localhost`, never touches the domain either way.
- `run_tunnel.bat` — publishes to `play.dungeonlair.co.za`, a hostname
  Railway has never claimed.

Nothing here requires pausing or shutting anything down until you're ready
to fully retire the Railway app.

## Cutting over later, when the current campaign ends

When you're ready to replace the Railway app with this one on the real
`www.dungeonlair.co.za` address, do it in this order so the domain is never
briefly pointed at nothing:

1. **Point DNS at the tunnel first, while Railway is still running:**
   In the Cloudflare dashboard → your zone → **DNS** → **Records**, find the
   existing record for `www` (it points at something like
   `<your-app>.up.railway.app`). Either edit it or delete-and-recreate it so
   `www` instead points at your tunnel — easiest way is:
   ```bash
   cloudflared tunnel route dns dungeonlair www.dungeonlair.co.za
   ```
   If Cloudflare complains a record for `www` already exists, delete the old
   Railway CNAME in the DNS tab first, then re-run the command above.
2. **Update `config.yml`'s `hostname`** (and `run_tunnel.bat`'s printed URL)
   from `play.dungeonlair.co.za` to `www.dungeonlair.co.za` to match.
3. **Confirm the new app works** at `https://www.dungeonlair.co.za` with
   `run_tunnel.bat` running.
4. **Only then, disconnect Railway:** in the Railway dashboard, open the
   service → **Settings** → **Networking**, find the custom domain entry
   for `dungeonlair.co.za` / `www.dungeonlair.co.za`, and remove it (the
   trash/"..." icon next to the domain). This just unlinks the domain —
   it doesn't delete the service or its data, so it's easy to undo if
   something's wrong.
5. **Optional — actually stop the Railway service** (to stop any usage
   billing) once you're confident you won't need to fall back to it: open
   the service, go to the **Deployments** tab, and remove the active
   deployment via its "..." menu. The project and its data stay intact;
   redeploying later just needs a new deployment from the same repo/image.
   Deleting the whole project is the only step that's hard to reverse —
   skip that unless you're certain you're done with it for good.

## Notes

- The tunnel only carries the web page and the signaling WebSocket
  (chat/presence/dice/combat/voice-*join/leave/signal* messages) — actual
  voice audio is still direct browser-to-browser WebRTC (mesh), same as
  before. It never flows through the tunnel or costs you bandwidth on
  anything hosted elsewhere.
- Nothing sensitive here touches the git repo: `cert.pem`, the tunnel
  credentials JSON, and `config.yml` all live under
  `%USERPROFILE%\.cloudflared\`, outside this project folder.
- Since this only needs to run ~4 hours/week, there's no need to install
  `cloudflared` as a background Windows service — `run_tunnel.bat` starting
  it fresh each session (and you closing the window when done) is simpler
  and means nothing is exposed to the internet outside game night.
- `run_public.bat` (port-forwarding + self-signed cert) still exists as a
  fallback if Cloudflare ever has an outage, but `run_tunnel.bat` should be
  the one you reach for normally.
