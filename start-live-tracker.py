import argparse
import http.server
import socketserver
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent


def main():
    parser = argparse.ArgumentParser(description="Start FusionDex Tracker with live save sync.")
    parser.add_argument("--save", default=None, help="Path to File A.rxdata, File B.rxdata, etc.")
    parser.add_argument("--port", type=int, default=8765, help="Local web server port.")
    args = parser.parse_args()

    sync_cmd = [sys.executable, str(ROOT / "sync-save.py"), "--watch"]
    if args.save:
      sync_cmd.extend(["--save", args.save])

    sync_process = subprocess.Popen(sync_cmd, cwd=str(ROOT))
    handler = http.server.SimpleHTTPRequestHandler

    try:
        with socketserver.TCPServer(("127.0.0.1", args.port), handler) as server:
            url = f"http://127.0.0.1:{args.port}/"
            print(f"FusionDex Tracker is running at {url}")
            print("Leave this window open while you play.")
            webbrowser.open(url)
            server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping FusionDex Tracker.")
    finally:
        sync_process.terminate()


if __name__ == "__main__":
    main()
