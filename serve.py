from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
print("PFA website: http://localhost:8000")
ThreadingHTTPServer(("127.0.0.1",8000),SimpleHTTPRequestHandler).serve_forever()
