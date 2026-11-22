# About I Was Here

[Canonical project page](https://riemannsolved.com/about/)

I Was Here is Cinna Davis’s time capsule for the Riemann Hypothesis announcement on November 20, 2026.

## Why keep a register?

When Levent Alpöge announced that he and Claude had found a proof of the Riemann Hypothesis, Cinna built a place for people to record where they were and what they thought when they heard the news.

Each signature gets a number and a UTC timestamp on a badge. Signers can leave a note in the public register or keep their entry private.

- [Levent Alpöge’s original announcement](https://alpo.ge/remark.pdf)
- [What the witness number and dates record](https://riemannsolved.com/history/)

## How the project was built

Cinna built the site with help from Astra in Codex. The badge engraving is drawn from values of the Riemann zeta function, with gold marks at its first five nontrivial zeros above the real axis. GitHub Pages hosts the website. A Cloudflare Worker with D1 records signatures, assigns numbers, and renders badges.

- [Registry source code](https://github.com/1337isnot1337/riemann-witness)
- [Cinna Davis’s other projects](https://itsdavis.com/projects/)
