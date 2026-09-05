@echo off
echo Starting Dungeon Lair backend, frontend, and Cloudflare Tunnel...
echo.
echo Everyone (including you) connects at:
echo   https://play.dungeonlair.co.za
echo.
echo No port forwarding, no router changes, no certificate warnings --
echo Cloudflare terminates HTTPS at their edge with a real trusted
echo certificate for the domain, so voice chat's mic access works
echo cleanly for everyone. This replaces run_public.bat and its
echo self-signed-cert / port-forwarding setup.
echo.
echo One-time setup required before this works -- see
echo CLOUDFLARE_TUNNEL_SETUP.md if you haven't done it yet.

start "Dungeon Lair - Server" cmd /k "cd /d %~dp0server && npm start"
start "Dungeon Lair - Client" cmd /k "cd /d %~dp0client && npm run dev"
start "Dungeon Lair - Tunnel" cmd /k "cloudflared tunnel run dungeonlair"

echo.
echo Three windows are starting: server, client, and the Cloudflare Tunnel.
echo Give them a few seconds to settle, then open the URL above.
echo Close all three windows (or Ctrl+C in each) when you're done for the night.
pause
