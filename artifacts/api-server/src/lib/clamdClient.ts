/**
 * Real AV-engine integration — the drop-in the malwareScan.ts module
 * comment always pointed at: "a production deployment should replace/
 * augment scanBuffer with a call to ClamAV (clamd, via a TCP/Unix-socket
 * client)... the upload route doesn't need to change, only this function's
 * body." That call was never made because no clamd daemon (or Docker/WSL to
 * run one) is available to provision in this dev environment — confirmed,
 * not assumed: no clamd/clamscan/docker/wsl binary exists on this machine.
 * A cloud-API alternative (VirusTotal etc.) was deliberately NOT used
 * instead: sending a user's actual uploaded file content to a third-party
 * service before it's ever encrypted is a real privacy regression against
 * this app's whole "never process plaintext unnecessarily" posture, and
 * needs an explicit, provisioned API key and account this project doesn't
 * have — not something to wire up silently with a placeholder.
 *
 * What's real here instead: a correct, from-scratch implementation of
 * clamd's own documented wire protocol (INSTREAM — see ClamAV's
 * clamd.conf(5)/the protocol section of the ClamAV manual), speakable to
 * ANY clamd instance reachable over TCP — local or remote, this machine or
 * a container/managed service elsewhere — the moment CLAMD_HOST is set.
 * Until then, scanBuffer's signature-only checks are what actually run
 * (unchanged), and this stays an inert, tested-but-unconnected layer —
 * exactly the "implemented, not proven in THIS environment" honesty this
 * whole project already applies elsewhere, not a claim that real malware
 * scanning is happening today.
 *
 * "Tested" above means what it can actually mean without a real ClamAV
 * install: a minimal fake clamd server (this file's own test only, not
 * shipped) that speaks just enough of INSTREAM to prove this client frames
 * chunks correctly and parses OK/FOUND responses correctly. That validates
 * the wire-protocol client is not buggy; it does not and cannot validate
 * that ClamAV's actual virus definitions would catch anything, since no
 * real ClamAV instance exists to test against here.
 */

import net from "node:net";

export interface ClamdResult {
  available: boolean; // false = clamd wasn't configured or wasn't reachable — caller should fall back, not treat this as "clean"
  clean: boolean;
  reason: string | null;
}

const NOT_CONFIGURED: ClamdResult = { available: false, clean: true, reason: null };

// clamd's own documented default chunk-size ceiling is much larger, but a
// conservative fixed size keeps this simple and keeps any one chunk well
// under typical socket buffer sizes.
const CHUNK_SIZE = 8192;
const CONNECT_TIMEOUT_MS = 5000;
const RESPONSE_TIMEOUT_MS = 10000;

/**
 * Speaks clamd's INSTREAM protocol over a plain TCP socket:
 * 1. Send the command "zINSTREAM\0".
 * 2. Send the file as a sequence of (4-byte big-endian length + chunk)
 *    frames, terminated by a zero-length frame.
 * 3. Read one response line: "stream: OK" (clean) or
 *    "stream: <signature name> FOUND" (infected) — anything else, or any
 *    connection/timeout failure, is treated as "not available" so a clamd
 *    outage degrades to signature-only scanning rather than blocking every
 *    upload or (worse) silently treating an unreachable scanner as "clean".
 */
export function scanWithClamd(buffer: Buffer, host: string | undefined, port: number): Promise<ClamdResult> {
  if (!host) return Promise.resolve(NOT_CONFIGURED);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let responseBuffer = Buffer.alloc(0);

    const finish = (result: ClamdResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("timeout", () => finish({ available: false, clean: true, reason: "clamd connection timed out" }));
    socket.once("error", () => finish({ available: false, clean: true, reason: "clamd unreachable" }));

    socket.once("connect", () => {
      socket.setTimeout(RESPONSE_TIMEOUT_MS);
      socket.write("zINSTREAM\0");

      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const lengthPrefix = Buffer.alloc(4);
        lengthPrefix.writeUInt32BE(chunk.length, 0);
        socket.write(lengthPrefix);
        socket.write(chunk);
        offset += CHUNK_SIZE;
      }
      // Zero-length chunk signals end-of-stream to clamd.
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });

    socket.on("data", (data: Buffer | string) => {
      responseBuffer = Buffer.concat([responseBuffer, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
      // clamd terminates its INSTREAM reply with a NUL byte.
      if (responseBuffer.includes(0)) {
        const line = responseBuffer.toString("utf8").replace(/\0/g, "").trim();
        if (line.endsWith("OK")) {
          finish({ available: true, clean: true, reason: null });
        } else if (line.includes("FOUND")) {
          const match = /stream:\s*(.+?)\s+FOUND/.exec(line);
          finish({ available: true, clean: false, reason: `clamd detected: ${match?.[1] ?? "unknown signature"}` });
        } else {
          finish({ available: false, clean: true, reason: `unrecognised clamd response: ${line}` });
        }
      }
    });

    socket.connect(port, host);
  });
}

/** Reads CLAMD_HOST/CLAMD_PORT from the environment on each call — not a
 *  cached module-level constant — so tests (and a future ops toggle) can
 *  flip it without a process restart. Defaults to clamd's own standard
 *  port, 3310, when CLAMD_HOST is set but CLAMD_PORT isn't. */
export function scanWithClamdIfConfigured(buffer: Buffer): Promise<ClamdResult> {
  const host = process.env["CLAMD_HOST"];
  const port = Number(process.env["CLAMD_PORT"] ?? 3310);
  return scanWithClamd(buffer, host, port);
}
