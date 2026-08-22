from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []
HTML_FILES = sorted(ROOT.glob("*.html"))
JS_FILES = sorted((ROOT / "assets").glob("*.js"))
ALL_JS = "\n".join(path.read_text(errors="ignore") for path in JS_FILES)
KNOWN_DATA = {
    "menu-open", "menu-close", "search-open", "search-close", "accordion",
    "modal-open", "modal-close", "location", "share-page", "copy-text",
    "help-tab", "cart-open", "cart-close", "add", "buy", "pay",
    "card-side", "card-flip", "member-side", "member-flip", "amount", "preview", "issued-preview",
    "x-check", "patron-pay", "give-pay",
    "enter-portal", "world-zoom", "replay-opening", "scroll-to"
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []
        self.buttons = []
        self.current_button = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag in {"a", "link", "script", "img", "video", "source", "track"}:
            attr = "href" if tag in {"a", "link"} else "src"
            if values.get(attr):
                self.refs.append((attr, values[attr]))
        if tag == "button":
            self.current_button = {"attrs": values, "text": []}

    def handle_data(self, data):
        if self.current_button is not None:
            self.current_button["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "button" and self.current_button is not None:
            self.current_button["text"] = " ".join("".join(self.current_button["text"]).split())
            self.buttons.append(self.current_button)
            self.current_button = None


def parse(path):
    parser = PageParser()
    parser.feed(path.read_text(errors="ignore"))
    return parser


PARSED = {path.resolve(): parse(path) for path in HTML_FILES}

for path in HTML_FILES:
    text = path.read_text(errors="ignore")
    if "\u2014" in text or "\u2013" in text:
        ERRORS.append(f"{path.name}: contains forbidden dash character")
    page = PARSED[path.resolve()]

    for attr, value in page.refs:
        if value in {"#", "javascript:void(0)", "javascript:;"} or value.startswith("javascript:"):
            ERRORS.append(f"{path.name}: dead {attr} {value}")
        if re.match(r"^(https?:|mailto:|tel:|data:)", value):
            continue
        target, fragment = (value.split("#", 1) + [""])[:2]
        target = target.split("?", 1)[0]
        if target:
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(ROOT.resolve())
            except ValueError:
                continue
            if not resolved.exists():
                ERRORS.append(f"{path.name}: missing target {value}")
            elif fragment and resolved.suffix == ".html" and fragment not in PARSED[resolved].ids:
                ERRORS.append(f"{path.name}: missing fragment {value}")
        elif fragment and fragment not in page.ids:
            ERRORS.append(f"{path.name}: missing local fragment #{fragment}")

    for button in page.buttons:
        attrs = button["attrs"]
        if attrs.get("type", "submit") == "submit" or "disabled" in attrs or "onclick" in attrs:
            continue
        data_keys = [key[5:] for key in attrs if key.startswith("data-")]
        if any(key in KNOWN_DATA for key in data_keys):
            continue
        button_id = attrs.get("id")
        classes = attrs.get("class", "").split()
        wired = bool(button_id and (f"#{button_id}" in ALL_JS or f"'{button_id}'" in ALL_JS or f'"{button_id}"' in ALL_JS))
        wired = wired or any(f".{name}" in ALL_JS for name in classes)
        if not wired:
            ERRORS.append(f'{path.name}: possibly unwired button "{button["text"]}" id={button_id or "-"}')

for path in JS_FILES:
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if result.returncode:
        ERRORS.append(f"{path.name}: JS syntax error\n{result.stderr.strip()}")

for path in [*HTML_FILES, *JS_FILES, ROOT / "assets/site.css"]:
    text = path.read_text(errors="ignore")
    if any(name in text for name in ("pfa-base.css", "pfa-stage.css", "pfa-app.css")):
        ERRORS.append(f"{path.name}: references source design CSS")

if ERRORS:
    print("\n".join("ERROR: " + error for error in ERRORS))
    sys.exit(1)

print(f"PASS: {len(HTML_FILES)} HTML pages, {len(JS_FILES)} JavaScript files, internal links and buttons audited.")
