@echo off
echo Starting Dungeon Lair backend and frontend (PUBLIC MODE)...
echo.
echo This is the same as run.bat, except the frontend binds to every network
echo interface on this PC (not just localhost), so it's reachable once you've
echo forwarded a port on your router. See the port-forwarding note below --
echo you only need to forward ONE port.

start "Dungeon Lair - Server" cmd /k "cd /d %~dp0server && npm start"
start "Dungeon Lair - Client" cmd /k "cd /d %~dp0client && npm run dev -- --host"

echo.
echo Both servers are starting in separate windows.
echo.
echo ============================================================
echo   PORT FORWARDING -- forward this ONE port on your router:
echo.
echo     TCP  5173   -^>  this PC's LAN IP, port 5173
echo.
echo   Do NOT forward port 4000 (the backend). The frontend dev
echo   server proxies /api and /ws to it internally over localhost,
echo   so outside traffic never needs to reach it directly.
echo.
echo   Voice chat itself needs no forwarding at all -- WebRTC finds
echo   a path between browsers via STUN. If a call between two
echo   people on different networks won't connect, that's a
echo   restrictive/symmetric NAT on one end, which a forwarded port
echo   can't fix (would need a TURN relay instead -- a separate,
echo   later addition, not this script).
echo ============================================================
echo.
echo Friends connect at:  https://YOUR_PUBLIC_IP:5173
echo   (find your public IP at whatismyip.com, or your router's
echo   WAN/status page -- it's different from the 192.168.x.x LAN
echo   IP vite prints in the client window)
echo.
echo They'll hit a certificate warning (self-signed dev cert, and it
echo won't list their address as a covered name either) -- same as
echo on your own phone: click Advanced -^> Proceed/Continue.
echo.
echo Heads up: this exposes a development server directly to the
echo internet, unhardened. Fine for a game session with people you
echo trust; don't leave it running unattended for long stretches.
echo Close both windows (or Ctrl+C in each) when you're done.
echo.
pause
