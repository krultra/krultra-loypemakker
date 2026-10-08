/* Felles tema for publiserte kart. Lastes i head for å unngå et lyst blink.
   ?theme=auto|light|dark lar innbyggingssiden velge uavhengig av OS-tema. */
(() => {
  'use strict';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const valgt = new URLSearchParams(location.search).get('theme');
  let modus = ['light', 'dark'].includes(valgt) ? valgt : 'auto';
  let velger;
  function oppdater() {
    document.documentElement.dataset.theme = modus === 'auto'
      ? (media.matches ? 'dark' : 'light') : modus;
    if (velger) velger.value = modus;
    window.dispatchEvent(new Event('kul-theme-change'));
  }
  window.KulTheme = {
    medTema(href) {
      if (!href || modus === 'auto') return href;
      const url = new URL(href, location.href);
      url.searchParams.set('theme', modus);
      return url.href;
    }
  };
  oppdater();
  media.addEventListener('change', oppdater);
  document.addEventListener('DOMContentLoaded', () => {
    const knapper = document.getElementById('topp-knapper') ||
      document.getElementById('arena-topp-knapper');
    if (!knapper) return;
    velger = document.createElement('select');
    velger.className = 'tema-velger';
    function oversett() {
      const en = document.documentElement.lang === 'en';
      velger.setAttribute('aria-label', en ? 'Colour theme' : 'Fargetema');
      velger.title = en ? 'Colour theme' : 'Fargetema';
      velger.replaceChildren(...(en
        ? ['System theme', 'Light', 'Dark'] : ['Automatisk tema', 'Lyst', 'Mørkt'])
        .map((tekst, i) => new Option(tekst, ['auto', 'light', 'dark'][i])));
      velger.value = modus;
    }
    oversett();
    new MutationObserver(oversett).observe(document.documentElement,
      { attributes: true, attributeFilter: ['lang'] });
    velger.addEventListener('change', () => {
      modus = velger.value;
      const url = new URL(location.href);
      url.searchParams.set('theme', modus);
      // Bevar valget ved språkbytte, fullskjerm og deling uten å laste kartet på nytt.
      history.replaceState(history.state, '', url.href);
      oppdater();
      // Oppdater også allerede bygde arena- og flyover-lenker.
      document.querySelectorAll('.wpt-popup-arena a, #video-lenke').forEach(a => {
        if (!a.getAttribute('href')) return;
        const lenke = new URL(a.href);
        lenke.searchParams.set('theme', modus);
        a.href = lenke.href;
      });
    });
    knapper.append(velger);
  });
})();
