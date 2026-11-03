// Progressive enhancement only. Prepared answers remain readable without JavaScript.
(() => {
  const root = document.querySelector('#ask-about-experience');
  if (!root) return;
  function reveal(hash, focus = false) {
    const target = Array.from(root.querySelectorAll('details')).find(item => '#' + item.id === hash);
    if (!target) return;
    target.open = true;
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
  reveal(location.hash);
})();
