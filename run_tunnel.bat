@echo off
echo Starting Dungeon Lair (built client + backend) and Cloudflare Tunnel...
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
echo The client is built once and served by the backend itself on port 4000,
echo so there is no Vite dev server in the path. Your
echo %%USERPROFILE%%\.cloudflared\config.yml ingress must point at
echo http://localhost:4000 (see CLOUDFLARE_TUNNEL_SETUP.md).
echo.
echo One-time setup required before this works -- see
echo CLOUDFLARE_TUNNEL_SETUP.md if you haven't done it yet.
echo.

echo Building the client (re-run this bat after any client code change)...
pushd "%~dp0client"
call npm run build
if errorlevel 1 (
  echo.
  echo Client build FAILED -- not starting anything. Fix the error above first.
  popd
  pause
  exit /b 1
)
popd

start "Dungeon Lair - Server" cmd /k "cd /d %~dp0server && npm start"
start "Dungeon Lair - Tunnel" cmd /k "cloudflared tunnel run dungeonlair"

echo.
echo Two windows are starting: the server (API + websocket + built client)
echo and the Cloudflare Tunnel.
echo Give them a few seconds to settle, then open the URL above.
echo Close both windows (or Ctrl+C in each) when you're done for the night.
pause
