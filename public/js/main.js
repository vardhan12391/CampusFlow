/**
 * public/js/main.js
 * ---------------------------------------------------------------------------
 * Small pieces of vanilla JavaScript that every page can use:
 *   1. auto-dismiss Bootstrap alerts after a few seconds
 *   2. confirm before a destructive action (data-confirm="...")
 *
 * Notice the pattern used here - the same one you will use everywhere:
 *   select element -> addEventListener -> do something with the DOM.
 */
document.addEventListener('DOMContentLoaded', function () {
  // --- 1. auto-hide flash alerts -----------------------------------------
  document.querySelectorAll('.alert-dismissible').forEach(function (alert) {
    window.setTimeout(function () {
      const bootstrapAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bootstrapAlert.close();
    }, 5000);
  });

  // --- 2. "Are you sure?" before delete / deactivate ----------------------
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      const message = form.getAttribute('data-confirm');
      if (!window.confirm(message)) {
        event.preventDefault(); // user clicked Cancel
      }
    });
  });
});
