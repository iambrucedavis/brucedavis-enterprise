(() => {
  const root = document.querySelector('#ask-about-experience');
  if (!root) return;
  const form = root.querySelector('form'), input = root.querySelector('textarea');
  const send = root.querySelector('[data-send]'), clear = root.querySelector('[data-clear]');
  const retry = root.querySelector('[data-retry]'), status = root.querySelector('[data-status]');
  const log = root.querySelector('[role="log"]'), counter = root.querySelector('[data-count]');
  let controller = null, generation = 0, pendingQuestion = null, pendingEntry = null, timer = null;
  const errors = {
    unavailable:'The AI assistant is unavailable right now. Please retry or contact Bruce using the email link below.',
    busy:'The AI assistant is handling other questions. Please wait a moment and retry, or contact Bruce below.',
    rate_limit:'Too many questions have been sent. Please wait before retrying, or contact Bruce below.',
    budget:'The assistant has reached its daily usage limit. Please try again tomorrow or contact Bruce below.',
    too_long:'Please keep your question to 1,000 characters or fewer.',
    invalid_request:'Please enter a question of 1,000 characters or fewer.'
  };
  function update() {
    counter.textContent = input.value.length + ' / 1,000 characters';
    send.disabled = Boolean(controller) || !input.value.trim() || input.value.length > 1000;
    input.setCustomValidity(input.value.length > 1000 ? errors.too_long : '');
  }
  function busy(on) {
    form.setAttribute('aria-busy',String(on));
    input.readOnly = on;
    root.querySelectorAll('[data-starter]').forEach(button => { button.disabled = on; });
    update();
  }
  function entry(question) {
    const item = document.createElement('article'); item.className = 'assistant-turn';
    const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'You asked';
    const text = document.createElement('p'); text.textContent = question;
    item.append(label,text); log.append(item);
    // Bound page-memory history; nothing is written to browser storage.
    while(log.children.length > 8) log.firstElementChild.remove();
    return item;
  }
  function validate(body) {
    if (!body || !['answered','unsupported'].includes(body.status) || typeof body.answer !== 'string' || !body.answer || body.answer.length > 1600 || !Array.isArray(body.sources) || body.sources.length > 2) return false;
    if (body.status === 'unsupported' && (body.answer !== 'I don’t have verified information about that' || body.sources.length)) return false;
    if (body.status === 'answered' && !body.sources.length) return false;
    return body.sources.every(source => source && typeof source.title === 'string' && source.title.length <= 150 && typeof source.id === 'string' && /^[a-z0-9-]+$/.test(source.id) && typeof source.href === 'string' && /^\/(?:index|enterprise-experience|bruce-davis-resume|automation-infrastructure|014-day-one)\.html(?:#[a-z0-9-]+)?$/.test(source.href));
  }
  async function ask(question, repeated = false) {
    if (controller) return;
    if (!question.trim() || question.length > 1000) { status.textContent = question.length > 1000 ? errors.too_long : errors.invalid_request; input.focus(); return; }
    clearTimeout(timer); retry.hidden = true; retry.disabled = false;
    pendingQuestion = question; pendingEntry = repeated && pendingEntry ? pendingEntry : entry(question);
    const thisEntry = pendingEntry, current = ++generation;
    const requestController = new AbortController(); controller = requestController; const signal = requestController.signal;
    const timeout = setTimeout(() => requestController.abort(),16000);
    busy(true); status.textContent = 'Finding published information…';
    try {
      const response = await fetch('/api/recruiter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),signal,cache:'no-store',credentials:'same-origin'});
      let body; try { body = await response.json(); } catch { throw new Error('unavailable'); }
      if (current !== generation) return;
      if (!response.ok) {
        const code = Object.hasOwn(errors,body?.error) ? body.error : 'unavailable';
        status.textContent = errors[code]; retry.hidden = false;
        if (response.status === 429 && Number.isInteger(body.retryAfter) && body.retryAfter > 0) {
          retry.disabled = true;
          const seconds = Math.min(body.retryAfter,86400);
          status.textContent += seconds <= 120 ? ' Try again in about '+seconds+' '+(seconds===1?'second.':'seconds.') : '';
          timer = setTimeout(() => { if(current === generation) retry.disabled = false; },seconds*1000);
        }
        return;
      }
      if (!validate(body)) throw new Error('unavailable');
      const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'AI assistant';
      thisEntry.append(label);
      for (const paragraph of body.answer.split('\n\n')) { const p = document.createElement('p'); p.textContent = paragraph; thisEntry.append(p); }
      if(body.sources.length) {
        const sources = document.createElement('ul'); sources.className = 'assistant-sources'; sources.setAttribute('aria-label','Sources for this answer');
        for(const source of body.sources) { const li = document.createElement('li'), link = document.createElement('a'); link.href = source.href; link.textContent = source.title; li.append(link); sources.append(li); }
        thisEntry.append(sources);
      }
      status.textContent = 'Answer ready. Sources appear beneath the answer when available.';
      input.value = ''; pendingQuestion = null; pendingEntry = null;
    } catch {
      if(current !== generation) return;
      status.textContent = errors.unavailable; retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if(current === generation) { controller = null; busy(false); }
    }
  }
  form.addEventListener('submit',event => { event.preventDefault(); ask(input.value); });
  input.addEventListener('input',update);
  retry.addEventListener('click',() => { if(pendingQuestion) ask(pendingQuestion,true); });
  function reset(announce = true) {
    generation++; controller?.abort(); controller = null; clearTimeout(timer);
    log.replaceChildren(); input.value = ''; pendingQuestion = null; pendingEntry = null;
    retry.hidden = true; retry.disabled = false; busy(false); status.textContent = announce ? 'Chat cleared.' : '';
    if (announce) input.focus();
  }
  clear.addEventListener('click',() => reset());
  // Clear transient state before a page is placed in the browser's back cache.
  window.addEventListener('pagehide',() => reset(false));
  root.querySelectorAll('[data-starter]').forEach(button => button.addEventListener('click',() => { input.value = button.textContent.trim(); update(); input.focus(); }));
  root.querySelector('[data-chat-ui]').hidden = false;
  root.querySelector('[data-chat-noscript]').hidden = true;
  update();
})();
