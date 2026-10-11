/**
 * public/js/duplicateCheck.js
 * ---------------------------------------------------------------------------
 * Live "similar issue" check while the student is filling in the form.
 *
 * Demonstrates: DOM selection, event listeners, debounce, fetch,
 * async/await, JSON, error handling and DOM manipulation.
 *
 * IMPORTANT: this is only a convenience. The server performs exactly the
 * same check in controllers/complaintController.js before saving, so the
 * feature still works if JavaScript is disabled.
 */
document.addEventListener('DOMContentLoaded', function () {
  const categoryInput = document.getElementById('category');
  const locationInput = document.getElementById('location');
  const resultsBox = document.getElementById('similarResults');

  if (!categoryInput || !locationInput || !resultsBox) return;

  let debounceTimer;

  async function checkForSimilarIssues() {
    const category = categoryInput.value.trim();
    const location = locationInput.value.trim();

    resultsBox.innerHTML = '';
    if (!category || !location) return; // need both to search

    try {
      const url =
        '/api/complaints/similar?category=' +
        encodeURIComponent(category) +
        '&location=' +
        encodeURIComponent(location);

      const response = await fetch(url);
      if (!response.ok) throw new Error('Server answered ' + response.status);

      const result = await response.json(); // JSON -> JavaScript object
      if (!result.count) return;

      // --- build the warning box (textContent, never server HTML) ---------
      const box = document.createElement('div');
      box.className = 'alert alert-info py-2 mb-0';
      box.innerHTML = '<strong class="d-block"><i class="bi bi-info-circle me-1"></i>' +
        result.count + ' similar open issue(s) found below.</strong>';

      const list = document.createElement('ul');
      list.className = 'mb-1 small';

      result.data.forEach(function (complaint) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '/complaints/' + complaint.ticketId;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = complaint.ticketId + ' - ' + complaint.title;
        item.appendChild(link);
        list.appendChild(item);
      });

      box.appendChild(list);
      resultsBox.appendChild(box);
    } catch (error) {
      // Never break the form: the server-side check is the safety net.
      console.error('Similar issue check failed:', error);
    }
  }

  // debounce: wait until the student stops typing for 400 ms
  function scheduleCheck() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(checkForSimilarIssues, 400);
  }

  categoryInput.addEventListener('change', scheduleCheck);
  locationInput.addEventListener('input', scheduleCheck);
});
