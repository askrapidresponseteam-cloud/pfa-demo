/* In-browser ML background removal, for the photographs the plain-background
   cut-out declines.

   ---- why this model and not the obvious one ----------------------------

   The first result for "background removal" on GitHub is
   @imgly/background-removal-js. It is good, it runs in the browser, and it is
   AGPL-3.0. AGPL's network clause reaches software delivered to and run by
   users over a network, which is exactly what this is, and it would put a
   source-sharing obligation on the site that ships it. Being a charity does
   not exempt anyone - AGPL is about distribution, not about profit. So it is
   not used here.

   What is used instead is Transformers.js with onnx-community/ormbg-ONNX:
   Apache-2.0, so no obligation, and an IS-Net convolutional architecture
   rather than a transformer one. That second point matters more than it
   sounds. Transformer attention grows with the number of image patches, and
   at photograph resolution the intermediate tensors are large enough to
   exhaust WASM memory and take the browser tab with them. A CNN built for
   segmentation is far better behaved on the mid-range Android phones most of
   this register will be using.

   Xenova/modnet is the other reasonable choice, also Apache-2.0, and trained
   specifically for portrait matting. Worth testing against ormbg on real
   uploads before settling.

   ---- what this costs ----------------------------------------------------

   Nothing per image, and no photograph leaves the device - which is the whole
   argument for it over a hosted API. What it does cost is a download of the
   runtime and weights, tens of megabytes, the first time a member needs it.

   So it is loaded lazily and only on refusal. A member whose photograph was
   taken against a wall - most of them, since a card photograph is a passport
   photograph - never downloads any of this. Do not move this earlier in the
   flow to "improve" the result: it would put a large download in front of
   every person joining, to fix a minority of photographs. */

(function () {
  'use strict';

  /* Pinned rather than floating. An unpinned CDN import is someone else's
     deploy button wired to your signup form. */
  var RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0';
  var MODEL = 'onnx-community/ormbg-ONNX';

  var pipelinePromise = null;

  function load(onProgress) {
    if (pipelinePromise) return pipelinePromise;
    pipelinePromise = import(/* webpackIgnore: true */ RUNTIME + '/+esm')
      .then(function (mod) {
        return mod.pipeline('background-removal', MODEL, {
          progress_callback: function (report) {
            if (onProgress && report && report.status === 'progress' && report.total) {
              onProgress(report.loaded / report.total);
            }
          }
        });
      })
      .catch(function (error) {
        /* Let the next attempt try again rather than caching the failure. */
        pipelinePromise = null;
        throw error;
      });
    return pipelinePromise;
  }

  /* Returns a canvas with the subject on `ground`, or throws.
     `source` is an HTMLImageElement or a canvas. */
  function remove(source, ground, onProgress) {
    return load(onProgress).then(function (segmenter) {
      /* The model works at its own input size; feeding it a 12 megapixel
         upload wastes memory for no gain in the mask. */
      var long = Math.max(source.width, source.height);
      var scale = long > 1024 ? 1024 / long : 1;
      var work = document.createElement('canvas');
      work.width = Math.round(source.width * scale);
      work.height = Math.round(source.height * scale);
      work.getContext('2d').drawImage(source, 0, 0, work.width, work.height);

      return segmenter(work.toDataURL('image/png')).then(function (output) {
        var cut = output && output[0];
        if (!cut || !cut.toCanvas) throw new Error('no mask returned');

        var lifted = cut.toCanvas();
        var flat = document.createElement('canvas');
        flat.width = lifted.width;
        flat.height = lifted.height;
        var ctx = flat.getContext('2d');
        ctx.fillStyle = 'rgb(' + ground[0] + ',' + ground[1] + ',' + ground[2] + ')';
        ctx.fillRect(0, 0, flat.width, flat.height);
        ctx.drawImage(lifted, 0, 0);
        return flat;
      });
    });
  }

  window.PFAPhotoCutoutML = { remove: remove, RUNTIME: RUNTIME, MODEL: MODEL };
})();
