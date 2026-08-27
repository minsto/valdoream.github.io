"""
Valdoream Minecraft bridge — execute queued shop/console commands via RCON.

Run this script on the same machine as your NeoForge server (or anywhere that
can reach the server RCON port). It polls the website API and runs pending
commands, then confirms success or failure back to the site.

Requirements: Python 3.8+ (no extra packages).

1) Enable RCON in server.properties on the Minecraft server:
   enable-rcon=true
   rcon.port=25575
   rcon.password=your-secret-password

2) Set environment variables (PowerShell example):
   $env:SERVER_API_KEY = "your-cloudflare-secret"
   $env:VALDOREAM_SITE = "https://valdoream.pages.dev"
   $env:RCON_HOST = "127.0.0.1"
   $env:RCON_PORT = "25575"
   $env:RCON_PASSWORD = "your-rcon-password"

3) Run:
   python tools/minecraft-bridge.py

Create SERVER_API_KEY in Cloudflare Pages (Settings > Environment variables,
type Secret). Same value as SERVER_API_KEY here.
"""

import json
import os
import socket
import struct
import sys
import time
import urllib.error
import urllib.request

SITE = os.environ.get("VALDOREAM_SITE", "https://valdoream.pages.dev").rstrip("/")
API_KEY = os.environ.get("SERVER_API_KEY", "")
RCON_HOST = os.environ.get("RCON_HOST", "127.0.0.1")
RCON_PORT = int(os.environ.get("RCON_PORT", "25575"))
RCON_PASSWORD = os.environ.get("RCON_PASSWORD", "")
POLL_SEC = float(os.environ.get("POLL_INTERVAL", "5"))


def log(msg):
    print(time.strftime("[%H:%M:%S]"), msg, flush=True)


class RconError(Exception):
    pass


class RconClient:
  """Minimal Minecraft RCON client (Source RCON protocol)."""

  TYPE_AUTH = 3
  TYPE_CMD = 2
  TYPE_RESP = 0

  def __init__(self, host, port, password):
    self.host = host
    self.port = port
    self.password = password
    self.sock = None

  def connect(self):
    self.sock = socket.create_connection((self.host, self.port), timeout=10)
    if not self._auth():
      raise RconError("RCON authentication failed")

  def close(self):
    if self.sock:
      try:
        self.sock.close()
      except OSError:
        pass
      self.sock = None

  def run(self, command):
    if not self.sock:
      self.connect()
    return self._packet(self.TYPE_CMD, command)

  def _packet(self, ptype, body):
    req_id = 1
    payload = struct.pack("<ii", req_id, ptype) + body.encode("utf-8") + b"\x00\x00"
    packet = struct.pack("<i", len(payload)) + payload
    self.sock.sendall(packet)
    raw = self._recv_packet()
    if len(raw) < 8:
      raise RconError("RCON response too short")
    rid, rtype = struct.unpack("<ii", raw[:8])
    if rid == -1:
      raise RconError("RCON request failed")
    return raw[8:-2].decode("utf-8", errors="replace")

  def _recv_packet(self):
    size_data = self._recv_exact(4)
    size = struct.unpack("<i", size_data)[0]
    return self._recv_exact(size)

  def _recv_exact(self, n):
    buf = b""
    while len(buf) < n:
      chunk = self.sock.recv(n - len(buf))
      if not chunk:
        raise RconError("RCON connection closed")
      buf += chunk
    return buf

  def _auth(self):
    self._packet(self.TYPE_AUTH, self.password)
    return True


def api_request(method, path, body=None):
  url = SITE + path
  data = None
  headers = {"X-Server-Key": API_KEY, "Accept": "application/json"}
  if body is not None:
    data = json.dumps(body).encode("utf-8")
    headers["Content-Type"] = "application/json"
  req = urllib.request.Request(url, data=data, headers=headers, method=method)
  with urllib.request.urlopen(req, timeout=30) as res:
    return json.loads(res.read().decode("utf-8"))


def ack(entry_id, status, error=None):
  body = {"id": entry_id, "status": status}
  if error:
    body["error"] = error[:200]
  api_request("POST", "/api/minecraft/queue", body)


def main():
  if not API_KEY:
    log("ERROR: set SERVER_API_KEY environment variable")
    sys.exit(1)
  if not RCON_PASSWORD:
    log("ERROR: set RCON_PASSWORD environment variable")
    sys.exit(1)

  log("Bridge started — site=" + SITE + " rcon=" + RCON_HOST + ":" + str(RCON_PORT))
  rcon = RconClient(RCON_HOST, RCON_PORT, RCON_PASSWORD)

  while True:
    try:
      payload = api_request("GET", "/api/minecraft/queue")
      pending = payload.get("pending") or []
      if not pending:
        time.sleep(POLL_SEC)
        continue

      for entry in pending:
        cmd = entry.get("command", "")
        eid = entry.get("id")
        player = entry.get("player", "?")
        log("Execute [" + str(player) + "]: " + cmd)
        try:
          if not rcon.sock:
            rcon.connect()
          out = rcon.run(cmd)
          if out.strip():
            log("  -> " + out.strip())
          ack(eid, "done")
        except (RconError, OSError) as err:
          log("  FAILED: " + str(err))
          rcon.close()
          ack(eid, "failed", str(err))
    except urllib.error.HTTPError as err:
      log("API HTTP " + str(err.code) + ": " + err.read().decode("utf-8", errors="replace")[:200])
      time.sleep(POLL_SEC)
    except Exception as err:
      log("Loop error: " + str(err))
      time.sleep(POLL_SEC)


if __name__ == "__main__":
  main()
