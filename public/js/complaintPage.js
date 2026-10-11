/**
 * public/js/complaintPage.js
 * Posts a comment with the Fetch API so the page does not reload.
 *
 * The <form> still works without JavaScript (it posts to
 * /complaints/:id/comments); this file only adds the AJAX behaviour on top.
 */
document.addEventListener('DOMContentLoaded', function () {
  const commentForm = document.getElementById('commentForm');
  if (!commentForm) return;

  const ticketId = commentForm.dataset.ticket;
  const textarea = document.getElementById('commentBody');
  const button = document.getElementById('commentButton');
  const list = document.getElementById('commentList');
  const defaultButtonHtml = button.innerHTML;

  commentForm.addEventListener('submit', async function (event) {
    event.preventDefault(); // stop the normal page reload

    const body = textarea.value.trim();
    if (!body) return;

    button.disabled = true;
    button.textContent = 'Posting...';

    try {
      const response = await fetch('/api/complaints/' + ticketId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // send JSON
        body: JSON.stringify({ body }),                 // object -> JSON string
      });

      const data = await response.json();               // JSON -> object

      if (!response.ok) {
        const message = data.errors && data.errors[0] ? data.errors[0].msg : data.message;
        throw new Error(message || 'Could not post the comment.');
      }

      appendComment(data.data);
      textarea.value = '';
    } catch (error) {
      window.alert('Comment failed: ' + error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = defaultButtonHtml;
    }
  });

  function appendComment(comment) {
    const placeholder = list.querySelector('li.text-muted');
    if (placeholder) placeholder.remove();

    const item = document.createElement('li');
    item.className = 'd-flex mb-3';

    const avatar = document.createElement('div');
    avatar.className =
      'rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2';
    avatar.style.width = '2rem';
    avatar.style.height = '2rem';
    avatar.style.flex = '0 0 2rem';
    avatar.innerHTML = '<i class="bi bi-person"></i>';

    const bodyBox = document.createElement('div');
    bodyBox.className = 'bg-light rounded p-2 flex-grow-1';

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between';

    const author = document.createElement('strong');
    author.className = 'small';
    author.textContent = comment.authorName;

    const time = document.createElement('span');
    time.className = 'text-muted';
    time.style.fontSize = '0.75rem';
    time.textContent = new Date(comment.createdAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const text = document.createElement('div');
    text.className = 'small mb-0';
    text.style.whiteSpace = 'pre-line';
    text.textContent = comment.body;

    header.appendChild(author);
    header.appendChild(time);
    bodyBox.appendChild(header);
    bodyBox.appendChild(text);
    item.appendChild(avatar);
    item.appendChild(bodyBox);
    list.appendChild(item);

    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
