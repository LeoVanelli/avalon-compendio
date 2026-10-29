const sidebar = document.querySelector<HTMLElement>('#site-sidebar');
const menuButton = document.querySelector<HTMLButtonElement>('[data-toggle-menu]');
const desktopMenu = window.matchMedia('(min-width: 901px)');
let menuOpen = false;

function toggleMenu(open: boolean, moveFocus = true) {
  const wasOpen = menuOpen;
  menuOpen = open;
  document.body.classList.toggle('menu-open', open);
  document.body.classList.toggle('menu-collapsed', desktopMenu.matches && !open);
  if (sidebar) {
    sidebar.inert = !open;
    sidebar.setAttribute('aria-hidden', String(!open));
  }
  menuButton?.setAttribute('aria-expanded', String(open));
  menuButton?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  const openIcon = menuButton?.querySelector<HTMLElement>('[data-menu-icon-open]');
  const closeIcon = menuButton?.querySelector<HTMLElement>('[data-menu-icon-close]');
  if (openIcon) openIcon.hidden = open;
  if (closeIcon) closeIcon.hidden = !open;
  if (!moveFocus) return;
  if (open && !wasOpen) sidebar?.querySelector<HTMLAnchorElement>('a')?.focus();
  else if (!open && wasOpen) menuButton?.focus();
}
toggleMenu(desktopMenu.matches, false);
desktopMenu.addEventListener('change', (event) => {
  const focusWasInSidebar = Boolean(sidebar?.contains(document.activeElement));
  toggleMenu(event.matches, false);
  if (!event.matches && focusWasInSidebar) menuButton?.focus();
});
menuButton?.addEventListener('click', () => toggleMenu(!menuOpen));
document.querySelectorAll<HTMLElement>('[data-close-menu]').forEach((el) => {
  el.addEventListener('click', () => toggleMenu(false));
});

type SearchItem = { title: string; summary: string; tags: string[]; searchTerms: string[]; section: string; href: string };
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
const input = document.querySelector<HTMLInputElement>('#global-search');
const results = document.querySelector<HTMLElement>('#search-results');
const searchJSON = document.querySelector<HTMLScriptElement>('#site-search-data')?.textContent || '[]';
const items: SearchItem[] = JSON.parse(searchJSON);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHTML = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function search(query: string) {
  if (!results) return;
  const text = normalize(query.trim());
  if (!text) {
    results.innerHTML = '<p class="empty-search">Comece a digitar para explorar os registros do arquivo.</p>';
    return;
  }
  const found = items.filter((item) => normalize([item.title, item.summary, item.section, ...item.tags, ...item.searchTerms].join(' ')).includes(text)).slice(0, 12);
  results.innerHTML = found.length
    ? found.map((item) => `<a class="search-result" href="${escapeHTML(item.href)}"><span class="search-result-section">${escapeHTML(item.section)}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.summary)}</small></a>`).join('')
    : '<p class="empty-search">Nenhum registro encontrado. Tente outro termo.</p>';
}
function openSearch() {
  if (!dialog) return;
  if (!desktopMenu.matches) toggleMenu(false);
  if (!dialog.open) dialog.showModal();
  if (input) {
    input.value = '';
    search('');
    window.setTimeout(() => input.focus(), 20);
  }
}
document.querySelectorAll('[data-open-search]').forEach((button) => button.addEventListener('click', openSearch));
document.querySelectorAll('[data-close-search]').forEach((button) => button.addEventListener('click', () => dialog?.close()));
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
input?.addEventListener('input', () => search(input.value));
document.addEventListener('keydown', (event) => {
  const element = event.target as HTMLElement;
  const typing = ['INPUT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable;
  if (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    openSearch();
  }
  if (event.key === 'Escape' && !desktopMenu.matches && menuOpen) toggleMenu(false);
});

document.querySelectorAll<HTMLInputElement>('[data-card-filter]').forEach((field) => {
  const scope = field.closest<HTMLElement>('[data-catalog]');
  const counter = scope?.querySelector<HTMLElement>('[data-visible-count]');
  const empty = scope?.querySelector<HTMLElement>('[data-filter-empty]');
  field.addEventListener('input', () => {
    const term = normalize(field.value.trim());
    let visible = 0;
    scope?.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
      const match = normalize(`${card.dataset.title || ''} ${card.dataset.tags || ''}`).includes(term);
      card.hidden = !match;
      if (match) visible++;
    });
    if (counter) counter.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  });
});

document.querySelectorAll<HTMLElement>('[data-condition-catalog]').forEach((catalog) => {
  const field = catalog.querySelector<HTMLInputElement>('[data-condition-search]');
  const empty = catalog.querySelector<HTMLElement>('[data-condition-empty]');
  const count = catalog.querySelector<HTMLElement>('[data-condition-count]');
  let category = '';
  const update = () => {
    const term = normalize(field?.value.trim() || '');
    let visible = 0;
    catalog.querySelectorAll<HTMLElement>('[data-condition-card]').forEach((card) => {
      const categoryMatch = !category || card.dataset.category === category;
      const textMatch = normalize(card.textContent || '').includes(term);
      card.hidden = !(categoryMatch && textMatch);
      if (!card.hidden) visible++;
    });
    catalog.querySelectorAll<HTMLElement>('[data-condition-group]').forEach((group) => {
      group.hidden = !group.querySelector('[data-condition-card]:not([hidden])');
    });
    if (empty) empty.hidden = visible > 0;
    if (count) count.textContent = `${visible} ${visible === 1 ? 'condição' : 'condições'}`;
  };
  field?.addEventListener('input', update);
  catalog.querySelectorAll<HTMLButtonElement>('[data-condition-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      category = button.dataset.conditionFilter || '';
      catalog.querySelectorAll<HTMLButtonElement>('[data-condition-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      update();
    });
  });
  update();
});

document.querySelectorAll<HTMLElement>('[data-weapon-catalog]').forEach((catalog) => {
  const field = catalog.querySelector<HTMLInputElement>('[data-weapon-search]');
  const empty = catalog.querySelector<HTMLElement>('[data-weapon-empty]');
  const update = () => {
    const term = normalize(field?.value.trim() || '');
    let visible = 0;
    catalog.querySelectorAll<HTMLElement>('[data-weapon-card]').forEach((card) => {
      const match = normalize(card.textContent || '').includes(term);
      card.hidden = !match;
      if (match) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  };
  field?.addEventListener('input', update);
  update();
});
