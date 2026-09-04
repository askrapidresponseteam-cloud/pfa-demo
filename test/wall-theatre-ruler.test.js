'use strict';

/* The ruler under the theatre's stage is a timeline, not decoration. Each
 * film is a segment with eighths; the white line is where you are; pressing
 * the ruler seeks. That was true for a file the site plays and, until v1.214,
 * false for a YouTube film, because a plain embed reports nothing. These pin
 * the pieces that make it true for YouTube too, so the ticks cannot quietly
 * go back to being a strip that only moves for one kind of film.
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const wall = fs.readFileSync(path.join(ROOT, 'wall.html'), 'utf8');

test('the ruler is drawn as a programme: a segment per film, eighths, a playhead and a played line', () => {
  assert.match(wall, /function drawRule\(\)/);
  assert.match(wall, /for \(var k = 1; k < 8; k\+\+\)/, 'eighths of each film');
  ['thHead', 'thPlayed', 'thLab'].forEach((id) => assert.ok(wall.includes(id), `${id} is drawn`));
  assert.ok(!wall.includes('thHeadT'), 'no time rides the line: the controls row is the one clock on the screen');
  assert.match(wall, /\$\('#thRule'\)\.addEventListener\('click'/, 'pressing the ruler does something');
});

test('a YouTube film is opened through the player API, so the ruler can read and move it', () => {
  assert.match(wall, /enablejsapi=1/, 'the embed opts into the API');
  assert.match(wall, /&origin=' \+ encodeURIComponent\(location\.origin\)/, 'and names the page, which the API requires');
  assert.match(wall, /sc\.src = 'https:\/\/www\.youtube\.com\/iframe_api'/, 'the API script is loaded');
  assert.match(wall, /new window\.YT\.Player\(frame/, 'a player is attached to the frame');
  assert.match(wall, /yt\.player\.getDuration\(\)/, 'the duration comes from the player');
  assert.match(wall, /yt\.player\.getCurrentTime\(\)/, 'so does the time');
  /* The ruler seeks through the one player facade, which for a YouTube film
     is the player's own seekTo; the same facade serves the seek bar, the skip
     keys and the number keys. */
  assert.match(wall, /P\.seek\(\(f - i\) \* c\.d\)/, 'pressing the ruler seeks the film on the stage');
  assert.match(wall, /e\.player\.seekTo\(t, true\)/, 'and for a YouTube film that reaches the player');
  assert.match(wall, /e\.data === S\.ENDED\) onEnded\(\)/, 'the end of a YouTube film is the end of a film');
  assert.match(wall, /load\(cur \+ 1\)/, 'and the next one follows');
  assert.match(wall, /if \(on\) e\.player\.mute\(\); else \{ e\.player\.unMute\(\)/, 'the sound toggle does not restart the film');
  assert.match(wall, /sc\.onerror = function\(\)\{ resolve\(false\); \}/, 'a blocked script leaves the film playing as a plain embed');
});

test('both content security policies let the player API load', () => {
  ['vercel.json', 'firebase.json'].forEach((f) => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const script = /script-src[^;]*/.exec(text);
    assert.ok(script, `${f} names script-src`);
    assert.match(script[0], /https:\/\/www\.youtube\.com/, `${f}: iframe_api`);
    assert.match(script[0], /https:\/\/s\.ytimg\.com/, `${f}: the player bundle the API pulls in`);
    assert.match(script[0], /https:\/\/player\.vimeo\.com/, `${f}: Vimeo's player API`);
  });
});

test('a film may say where to start, and the theatre passes it to the player', () => {
  assert.match(wall, /start: optional, seconds into the film/);
  assert.match(wall, /\(at \? '&start=' \+ at : ''\)/, 'YouTube');
  assert.match(wall, /\(at \? '#t=' \+ at \+ 's' : ''\)/, 'Vimeo');
  const film = /\{wall:'long', title:'([^']+)', credit:'([^']+)', yt:'BVbpSc_EXlI', start:3753\}/.exec(wall);
  assert.ok(film, 'the shared film is on the long wall with its start point');
  assert.doesNotMatch(film[1], /test film/i, 'and is named, not a placeholder');
});
