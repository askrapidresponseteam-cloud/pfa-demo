// `npm run lint`. Browser files are ES5-style scripts sharing the `PFA`
// global from assets/site.js; server, script and test files are CommonJS.
import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  history: 'readonly', screen: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  fetch: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly',
  FormData: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly', Image: 'readonly',
  FontFace: 'readonly', ImageData: 'readonly', OffscreenCanvas: 'readonly', createImageBitmap: 'readonly',
  HTMLElement: 'readonly', HTMLCanvasElement: 'readonly', HTMLImageElement: 'readonly', Element: 'readonly',
  Node: 'readonly', NodeFilter: 'readonly', DocumentFragment: 'readonly', DOMParser: 'readonly',
  Event: 'readonly', CustomEvent: 'readonly', KeyboardEvent: 'readonly', MouseEvent: 'readonly',
  MutationObserver: 'readonly', IntersectionObserver: 'readonly', ResizeObserver: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', requestIdleCallback: 'readonly',
  getComputedStyle: 'readonly', matchMedia: 'readonly', scrollTo: 'readonly', innerWidth: 'readonly',
  innerHeight: 'readonly', devicePixelRatio: 'readonly', alert: 'readonly', confirm: 'readonly',
  prompt: 'readonly', open: 'readonly', print: 'readonly', crypto: 'readonly', performance: 'readonly',
  AbortController: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', atob: 'readonly',
  btoa: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly', XMLHttpRequest: 'readonly',
  Worker: 'readonly', WebSocket: 'readonly', Notification: 'readonly', customElements: 'readonly',
  CSS: 'readonly', Intl: 'readonly', Razorpay: 'readonly', firebase: 'readonly', PFA: 'readonly',
  // UMD wrappers in card-fields.js, field-rules.js and photo-cutout.js
  module: 'readonly', self: 'readonly'
};
const nodeGlobals = {
  require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly', Buffer: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', console: 'readonly', setTimeout: 'readonly',
  clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', setImmediate: 'readonly',
  clearImmediate: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
  AbortController: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', structuredClone: 'readonly',
  queueMicrotask: 'readonly', globalThis: 'readonly', crypto: 'readonly', performance: 'readonly',
  Headers: 'readonly', Request: 'readonly', Response: 'readonly', FormData: 'readonly', Blob: 'readonly',
  atob: 'readonly', btoa: 'readonly', Intl: 'readonly'
};
const shared = {
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Promise: 'readonly',
  Map: 'readonly', Set: 'readonly', WeakMap: 'readonly', WeakSet: 'readonly', Symbol: 'readonly',
  JSON: 'readonly', Math: 'readonly', Date: 'readonly', Uint8Array: 'readonly', ArrayBuffer: 'readonly',
  globalThis: 'readonly', undefined: 'readonly'
};

const rules = {
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-prototype-builtins': 'off',
  'no-control-regex': 'off',
  'no-cond-assign': ['error', 'except-parens'],
  // Zero-width spaces are used on purpose inside comments that must not
  // look like the build markers they describe (scripts/build-quiz-template.js).
  'no-irregular-whitespace': ['error', { skipComments: true }]
};

export default [
  js.configs.recommended,
  { ignores: ['node_modules/**', 'dist/**', 'public/**', '_inline-extracts/**', '_retired-assets/**', 'functions/node_modules/**'] },
  {
    files: ['assets/**/*.js', 'pfa-search.js', 'pfa-forms.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...shared, ...browserGlobals } },
    rules: { ...rules, 'no-redeclare': ['error', { builtinGlobals: false }] }
  },
  {
    files: ['api/**/*.js', 'lib/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'functions/**/*.js', 'build-index.js', 'tools/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...shared, ...nodeGlobals } },
    rules: { ...rules, 'no-sparse-arrays': 'off' }
  },
  { files: ['test/**/*.js'], rules: { 'no-unused-vars': 'off' } }
];
