'use strict';
// Native disclosure navigation; no sound, network calls, storage, or backend.
for (const menu of document.querySelectorAll('.mobile-nav')) {
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
