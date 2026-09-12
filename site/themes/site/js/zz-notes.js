/* Progressive navigation enhancements; retain Calepin's native view/search handlers. */
(() => {
  const main = document.querySelector('.calepin-website-main');
  const sidebar = document.querySelector('.calepin-website-sidebar');
  const shell = document.querySelector('.calepin-website-shell');
  if (!main || !sidebar || !shell) return;
  main.id ||= 'notes-main';
  main.tabIndex = -1;
  const skip = document.createElement('a');
  skip.className = 'notes-skip';
  skip.href = `#${main.id}`;
  skip.textContent = 'Skip to content';
  document.body.prepend(skip);

  const nav = sidebar.querySelector('nav[aria-label="Documentation"]');
  if (nav) {
    nav.setAttribute('aria-label', 'All notes');
    const title = document.createElement('div');
    title.className = 'notes-nav-title';
    title.textContent = 'NOTE INDEX';
    nav.prepend(title);
    const home = [...nav.querySelectorAll('a')].find(a => /\/index\.html$/.test(new URL(a.href).pathname));
    if (home) { home.textContent = 'All notes'; home.setAttribute('aria-label', 'All notes'); }
  }

  const toc = document.querySelector('.calepin-website-toc');
  if (toc) {
    toc.querySelector('.calepin-website-toc-title').textContent = 'On this page';
    const tocNav = toc.querySelector('nav');
    tocNav.setAttribute('aria-label', 'On this page');
    const compact = document.createElement('details');
    compact.className = 'notes-mobile-toc';
    const summary = document.createElement('summary');
    summary.textContent = 'On this page';
    compact.append(summary, tocNav.cloneNode(true));
    compact.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    compact.addEventListener('click', event => {
      if (event.target.closest('a')) compact.open = false;
    });
    const heading = main.querySelector('h1');
    if (heading) heading.after(compact);
  }

  // Calepin hides the drawer visually but doesn't manage keyboard focus.
  const toggle = document.querySelector('.calepin-website-nav-toggle');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'notes-drawer-close outline secondary';
  closeButton.textContent = 'Close navigation ×';
  closeButton.addEventListener('click', () => toggle?.click());
  sidebar.prepend(closeButton);
  const mobile = matchMedia('(max-width: 56rem)');
  const topbar = document.querySelector('.calepin-website-topbar');
  if (topbar) {
    new ResizeObserver(() => {
      // Actual toolbar height can exceed the theme token with CJK fonts or zoom.
      document.documentElement.style.setProperty('--notes-topbar-height', `${topbar.getBoundingClientRect().height}px`);
    }).observe(topbar);
  }
  let wasOpen = false;
  function syncDrawer() {
    const open = mobile.matches && shell.classList.contains('nav-open');
    sidebar.inert = mobile.matches && !open;
    main.inert = open;
    if (toc) toc.inert = open;
    if (open && !wasOpen) sidebar.querySelector('a, button, select')?.focus();
    if (!open && wasOpen) toggle?.focus();
    wasOpen = open;
  }
  new MutationObserver(syncDrawer).observe(shell, { attributes: true, attributeFilter: ['class'] });
  mobile.addEventListener('change', syncDrawer);
  syncDrawer();
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !wasOpen) return;
    const focusable = [...sidebar.querySelectorAll('a[href], button, select, summary, [tabindex="0"]')]
      .filter(el => el.getClientRects().length && !el.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
