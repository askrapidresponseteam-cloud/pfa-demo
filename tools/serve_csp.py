"""Serve a build with the same headers vercel.json sends, so the local page
behaves the way the deployed one does."""
import functools, json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = sys.argv[1]; PORT = int(sys.argv[2])
CFG = json.load(open(os.path.join(ROOT, "vercel.json")))
HEADERS = [(h["key"], h["value"]) for r in CFG["headers"] if r["source"] == "/(.*)"
           for h in r["headers"]]

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in HEADERS: self.send_header(k, v)
        SimpleHTTPRequestHandler.end_headers(self)
    def log_message(self, *a): pass

ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(H, directory=ROOT)).serve_forever()
