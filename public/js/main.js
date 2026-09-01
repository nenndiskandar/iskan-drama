/**
 * main.js — client-side interactivity
 * Lightweight, progressively enhanced.
 */
document.addEventListener('DOMContentLoaded', function () {
  // Provider filter dropdown — submit on change
  var providerFilter = document.getElementById('provider-filter');
  if (providerFilter) {
    // Form already submits via GET; handled natively
  }

  // Lazy-load images (fallback if browser doesn't support loading=lazy)
  var imgs = document.querySelectorAll('img[loading="lazy"]');
  if ('loading' in HTMLImageElement.prototype) return;
  // Native lazy-load supported
});
