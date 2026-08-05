"""Place the two wildlife clips as the page's chapter interludes.

The site is built as a film in chapters, and it already has one interlude: the
full-bleed band after the honours, carrying "Compassion. On Screen. In Action."
Both clips are cut as transition footage, a whip-pan in, one held moment of
tenderness, a whip-pan out, so they belong at the cuts between chapters, not in
a gallery.

Two placements, no new patterns:

  1. The existing band. Its still becomes the langur mother grooming her
     infant, and the clip plays behind the same line, using the hero's own
     runtime-video grammar: poster first, fade up on play, save-data and
     reduced-motion users keep the still.

  2. One more band before the closing chapter, the elephant walking with her
     calf under her trunk, carrying one new line: "Kindness, at 24 frames a
     second." The clips run at 24 fps, so the line is literally true of the
     footage behind it.

Run after cinekind.py.
"""
import base64
import os
import re
import sys

VID = "/home/claude/vid"


def b64(path, mime):
    return "data:%s;base64,%s" % (
        mime, base64.b64encode(open(path, "rb").read()).decode())


CSS = """

/* ---- the interludes -------------------------------------------------------
   Chapter breaks carry one clip and one line. The video uses the hero's own
   grammar: it sits under the line, fades up when it plays, and the poster
   still is what save-data and reduced-motion users keep. */
/* The band was cut for a 2.34:1 still, so 16:9 film dropped into it lost half
   the picture: at 1920 only 52% of the frame height survived, and on a phone
   only 50% of its width. The band now carries the film's own ratio and the
   frame is shown whole. contain rather than cover so that on a viewport wider
   than 16:9, where the height cap bites, the spare goes to ink at the sides,
   which is the page ground, rather than to a crop. */
.band{height:auto;aspect-ratio:16/9;max-height:100vh;background:var(--bg);
  margin-inline:auto}
.band img,.band video{object-fit:contain;object-position:center}
.band video{position:absolute;inset:0;width:100%;height:100%;
  opacity:0;transition:opacity 1.6s ease}
.band video.up{opacity:1}
/* one quiet layer so the line holds over bright footage, same grammar as the
   hero's scrim */
.band::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(180deg,rgba(14,17,22,.30) 0%,rgba(14,17,22,.16) 46%,rgba(14,17,22,.44) 100%)}
.bandline{z-index:2}
"""


def main(path):
    s = open(path, encoding="utf-8").read()

    # The lion's exact recipe: one H.264 track, 1280 x 720 at 24 fps, two-pass
    # to the same ~845 kbps, so each interlude costs what the hero costs and
    # nothing on the page plays at a different grade.
    monkey = b64(os.path.join(VID, "Monkey-web.mp4"), "video/mp4")
    elephant = b64(os.path.join(VID, "Elephant-web.mp4"), "video/mp4")
    mposter = b64(os.path.join(VID, "Monkey-poster.webp"), "image/webp")
    eposter = b64(os.path.join(VID, "Elephant-poster.webp"), "image/webp")

    # 1 - the existing band: its still becomes the langur poster
    m = re.search(r'(<img src=")[^"]+(" alt="" width=")\d+(" height=")\d+'
                  r'("[^>]*id="bandImg">)', s)
    if not m:
        print("  band image not found"); return
    s = s[:m.start()] + (m.group(1) + mposter + m.group(2) + "1280"
                         + m.group(3) + "720" + m.group(4)) + s[m.end():]

    # 2 - the second interlude, before the closing chapter
    about = s.find('<section class="sec" id="about">')
    if about == -1:
        print("  about section not found"); return
    band2 = ('<div class="band" id="band2" aria-hidden="true">'
             '<img src="' + eposter + '" alt="" width="1280" height="720" '
             'loading="lazy" decoding="async" id="band2Img">'
             '<div class="bandline"><p>Kindness, at <em>24 frames a second</em>.</p></div>'
             '</div>\n\n')
    s = s[:about] + band2 + s[about:]

    # 3 - style layer
    i = s.rfind("</style>")
    s = s[:i] + CSS + s[i:]

    # 4 - behaviour: the hero's own pattern, applied to both bands
    js = """
/* ---- interlude film ---- */
var BAND_SRC = ["%s","%s"];
(function(){
  /* self-contained guards: the page's own reduce/saveData live inside its IIFE */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  if (reduce || saveData || !("IntersectionObserver" in window)) return;
  var bands = [document.getElementById("bandImg"), document.getElementById("band2Img")];
  bands.forEach(function(img, k){
    if (!img) return;
    var host = img.parentNode, v = null;
    var io = new IntersectionObserver(function(e){
      if (e[0].isIntersecting){
        if (!v){
          v = document.createElement("video");
          v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
          v.setAttribute("muted",""); v.setAttribute("playsinline","");
          v.setAttribute("aria-hidden","true");
          v.src = BAND_SRC[k];
          v.addEventListener("playing", function(){ v.classList.add("up"); }, {once:true});
          host.insertBefore(v, img.nextSibling);
        }
        v.play().catch(function(){});
      } else if (v){ v.pause(); }
    }, {threshold: 0.25});
    io.observe(host);
  });
})();
""" % (monkey, elephant)
    j = s.rfind("</script>")
    s = s[:j] + js + s[j:]

    # the parallax paints only #bandImg; the second band takes the same hand
    s = s.replace(
        'var nav = document.getElementById("nav"), band = document.getElementById("bandImg"), tick = false;',
        'var nav = document.getElementById("nav"), tick = false;\n'
        'var bandImgs = [document.getElementById("bandImg"), document.getElementById("band2Img")];')
    s = s.replace(
        """  if (band && !reduce){
    var r = band.parentNode.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight){
      var p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
      band.style.transform = "scale(1.14) translateY(" + ((p - .5) * -42).toFixed(1) + "px)";
    }
  }""",
        """  if (!reduce) bandImgs.forEach(function(band){
    if (!band) return;
    var r = band.parentNode.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight){
      var p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
      band.style.transform = "scale(1.14) translateY(" + ((p - .5) * -42).toFixed(1) + "px)";
    }
  });""")

    open(path, "w", encoding="utf-8").write(s)
    print("  interludes placed: %d bytes" % len(s))


if __name__ == "__main__":
    main(sys.argv[1])
