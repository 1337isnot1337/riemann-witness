const milestones = [
  {
    date: '1859-10-19',
    label: 'Oct 19, 1859',
    endpoint: 'Proposed',
    title: 'Riemann’s letter to Berlin',
    description: 'In a paper sent with his October 19 letter, Riemann proposed that every nontrivial zero of the zeta function lies on the critical line. Ernst Kummer presented the paper to the Berlin Academy on November 3.',
    source: 'Berlin Academy proceedings',
    href: 'https://de.wikisource.org/wiki/Seite:RiemannPrim1859.djvu/1',
  },
  {
    date: '1896',
    title: 'The prime number theorem',
    description: 'Jacques Hadamard and Charles de la Vallée Poussin independently proved that the number of primes up to x grows like x / log x.',
    source: 'Hadamard’s original paper',
    href: 'https://www.numdam.org/articles/10.24033/bsmf.545/',
  },
  {
    date: '1914',
    title: 'Infinitely many zeros on the line',
    description: 'G. H. Hardy proved that infinitely many zeros of the zeta function lie on the critical line, where the real part is ½.',
    source: 'Hardy’s original note',
    href: 'https://fr.wikisource.org/wiki/Page:Comptes_rendus_hebdomadaires_des_s%C3%A9ances_de_l%E2%80%99Acad%C3%A9mie_des_sciences,_tome_158,_1914.djvu/1014',
  },
  {
    date: '1942',
    title: 'A positive proportion',
    description: 'Atle Selberg proved that the fraction of zeros on the critical line stays bounded away from zero as more zeros are counted.',
    source: 'Selberg’s original note',
    href: 'https://www.ntnu.no/ojs/index.php/DKNVS_skrifter/article/download/1457/1306',
  },
  {
    date: '1974',
    title: 'More than one third',
    description: 'Norman Levinson proved an asymptotic lower bound of more than one third for the share of nontrivial zeros on the critical line.',
    source: 'Levinson’s paper',
    href: 'https://www.math.ntnu.no/emner/MA3001/2020v/2022v_MA3004/Levinson.pdf',
  },
  {
    date: '2000',
    title: 'A Millennium Prize Problem',
    description: 'On May 24 in Paris, the Clay Mathematics Institute named the Riemann Hypothesis one of its seven Millennium Prize Problems.',
    source: 'Clay Mathematics Institute’s record',
    href: 'https://www.claymath.org/wp-content/uploads/2022/02/MPPc.pdf',
  },
  {
    date: '2019',
    title: 'More than five twelfths',
    description: 'Kyle Pratt, Nicolas Robles, Alexandru Zaharescu and Dirk Zeindler showed that more than five twelfths of the zeros lie on the critical line, improving the asymptotic lower bound.',
    source: 'The authors’ paper',
    href: 'https://link.springer.com/article/10.1007/s40687-019-0199-8',
  },
  {
    date: '2021',
    title: 'Checked to height three trillion',
    description: 'Dave Platt and Tim Trudgian used rigorous interval arithmetic to show that every nontrivial zero with positive imaginary part up to three trillion lies on the critical line.',
    source: 'Platt and Trudgian’s paper',
    href: 'https://doi.org/10.1112/blms.12460',
  },
  {
    date: '2026-11-20',
    label: 'Nov 20, 2026',
    endpoint: 'Solved',
    title: 'Alpöge’s proof announcement',
    description: 'Levent Alpöge reported finding a proof with Claude and released a Lean formalization of the claimed result.',
    source: 'Read Alpöge’s announcement',
    href: 'https://alpo.ge/remark.pdf',
  },
];

export function timeline() {
  return `<ol class="chronology" role="list" aria-label="Riemann Hypothesis milestones">${milestones.map(event => `
    <li class="chronology-event"><details name="riemann-chronology">
      <summary>${event.endpoint ? `<span class="chronology-endpoint">
        <span>${event.endpoint}</span><time datetime="${event.date}">${event.label}</time>
      </span>` : `<time datetime="${event.date}">${event.date}</time>`}</summary>
      <div class="chronology-note">
        <strong>${event.title}</strong>
        <p>${event.description}</p>
        <a href="${event.href}">${event.source}</a>
      </div>
    </details></li>`).join('')}</ol>`;
}
