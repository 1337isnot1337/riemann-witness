import { SITE } from './config.js';
import { page } from './pages.js';

const profiles = [
  {
    name: 'GitHub',
    url: 'https://github.com/1337isnot1337',
    icon: '<path d="M12 .8a11.3 11.3 0 0 0-3.57 22.02c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1.01 1.73 2.65 1.23 3.3.94.1-.73.4-1.23.71-1.51-2.51-.29-5.15-1.26-5.15-5.59 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.11 1.15a10.83 10.83 0 0 1 5.65 0c2.16-1.45 3.1-1.15 3.1-1.15.62 1.56.24 2.71.12 3 .72.79 1.16 1.79 1.16 3.02 0 4.34-2.64 5.3-5.16 5.58.41.35.76 1.04.76 2.1v3.08c0 .3.21.65.78.54A11.3 11.3 0 0 0 12 .8z"/>',
  },
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/in/cinna-davis/',
    icon: '<path fill-rule="evenodd" d="M3 2h18a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm2.4 7.1v9.8h3.1V9.1H5.4zm1.55-4.7a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM10.5 9.1v9.8h3.1v-5.3c0-1.5.3-2.4 1.7-2.4 1.3 0 1.5 1 1.5 2.4v5.3h3.1v-6c0-2.9-1-4.1-3.4-4.1-1.4 0-2.4.6-3 1.5V9.1z"/>',
  },
  {
    name: 'X',
    url: 'https://x.com/1337isnot1337',
    icon: '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932zm-1.29 19.49h2.039L6.487 3.24H4.3z"/>',
  },
];

export function aboutPage() {
  return page(new URL(SITE).origin, {
    path: '/about/',
    title: 'About I Was Here | The Riemann Hypothesis Witness Registry',
    description: 'I’m Cinna Davis. I built I Was Here as an independent time capsule for the November 20, 2026 Riemann Hypothesis announcement.',
    image: '/about-preview-v1.png',
    body: `<main id="main" class="about">
      <header class="about-heading">
        <img class="about-engraving" src="/art/critical-strip.svg" alt="" width="736" height="348">
        <div class="about-width">
          <h1>About I Was Here<em>.</em></h1>
          <p class="lede">I built this time capsule to mark the Riemann Hypothesis announcement on <time datetime="2026-11-20">November 20, 2026</time>.</p>
        </div>
      </header>
      <div class="about-paper">
        <div class="about-width about-layout">
          <div class="about-story">
            <section>
              <h2>Why keep a register?</h2>
              <p>When Levent Alpöge announced that he and Claude had found a proof of the Riemann Hypothesis, I wanted somewhere for people to record where they were and what they thought when they heard the news.</p>
              <p>Each signature gets a number and a UTC timestamp, printed on a badge you can keep or share. You can leave a note in the public register or keep your entry private.</p>
              <p><a href="https://alpo.ge/remark.pdf">Read Alpöge’s original announcement</a></p>
            </section>
            <section>
              <h2>How I built it</h2>
              <p>I built the site with help from Astra in Codex. The engraving comes from values of the Riemann zeta function, with five gold marks at its first five nontrivial zeros above the real axis.</p>
              <p>I host the site on GitHub Pages. A Cloudflare Worker records signatures in D1, assigns numbers, and renders each badge with the signer’s name and signing time.</p>
              <p><a href="https://github.com/1337isnot1337/riemann-witness">Explore the source code</a></p>
            </section>
          </div>
          <aside class="about-credit" aria-labelledby="about-creator">
            <h2 id="about-creator">Cinna Davis</h2>
            <p>I’m a student developer and researcher working in software, mathematics, physics, and robotics. I made this register as an independent project.</p>
            <a class="about-portfolio" href="https://1337isnot1337.github.io/"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M4 5h16v14H4zM8 9h8m-8 3h8m-8 3h4"/></svg>Portfolio</a>
            <nav class="about-profiles" aria-label="Cinna Davis’s social profiles">
              ${profiles.map(({name, url, icon}) => `<a href="${url}" aria-label="${name}" title="${name}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${icon}</svg></a>`).join('')}
            </nav>
          </aside>
        </div>
      </div>
    </main>`,
  });
}
