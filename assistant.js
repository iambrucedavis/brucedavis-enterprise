// Progressive enhancement only. Prepared answers remain readable without JavaScript.
(() => {
  const root = document.querySelector('#ask-about-experience');
  if (!root) return;
  const status = root.querySelector('.guide-status');
  const clear = root.querySelector('[data-clear-guide]');
  function reveal(hash, focus = false) {
    const target = Array.from(root.querySelectorAll('details')).find(item => '#' + item.id === hash);
    if (!target) return;
    target.open = true;
    status.textContent = "";
    if (focus) target.querySelector('summary').focus({ preventScroll: true });
    return target;
  }
  root.querySelectorAll('[data-experience-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = reveal(link.hash, true);
      if (!target) return;
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  });
  window.addEventListener('hashchange', () => reveal(location.hash));
  window.addEventListener('pageshow', () => reveal(location.hash));
  clear.hidden = false;
  clear.addEventListener('click', () => {
    root.querySelectorAll('details').forEach(item => { item.open = false; });
    if (location.hash.startsWith('#experience-')) history.replaceState(null, '', '#ask-about-experience');
    status.textContent = 'Guide cleared.';
    root.querySelector('[data-experience-link]').focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  window.addEventListener('pagehide', () => {
    root.querySelectorAll('details').forEach(item => { item.open = false; });
    status.textContent = '';
  });
  reveal(location.hash);
})();
