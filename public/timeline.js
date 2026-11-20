const chronology = document.querySelector('.chronology');

if (chronology) {
  let active;
  let mode;

  function closeNote() {
    if (active) active.open = false;
    active = undefined;
    mode = undefined;
  }

  function openNote(details, trigger) {
    if (active !== details) closeNote();
    details.open = true;
    active = details;
    mode = trigger;
  }

  for (const details of chronology.querySelectorAll('details')) {
    const summary = details.querySelector('summary');

    details.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && mode !== 'pinned' && mode !== 'focus') {
        openNote(details, 'hover');
      }
    });
    details.addEventListener('pointerleave', () => {
      if (active === details && mode === 'hover' && !details.contains(document.activeElement)) {
        closeNote();
      }
    });
    summary.addEventListener('focus', () => {
      if (summary.matches(':focus-visible') && !(active === details && mode === 'pinned')) {
        openNote(details, 'focus');
      }
    });
    details.addEventListener('focusout', event => {
      if (active === details && mode !== 'pinned' && !details.contains(event.relatedTarget)) {
        closeNote();
      }
    });
    summary.addEventListener('click', event => {
      event.preventDefault();
      if (active === details && mode === 'pinned') closeNote();
      else openNote(details, 'pinned');
    });
  }

  document.addEventListener('click', event => {
    if (active && !active.contains(event.target)) closeNote();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault();
    if (active.contains(document.activeElement)) active.querySelector('summary').focus();
    closeNote();
  });
}
