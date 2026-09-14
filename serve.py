from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
print("PFA website: http://localhost:8000")
class Handler(SimpleHTTPRequestHandler):
    # Vercel rewrites /help to help.html (vercel.json); the same here.
    def do_GET(self):
        if self.path.split("?")[0].split("#")[0] == "/help":
            self.path = "/help.html" + self.path[5:]
        return super().do_GET()
ThreadingHTTPServer(("127.0.0.1",8000),Handler).serve_forever()
