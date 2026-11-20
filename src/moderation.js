// Targeted English identity slurs, intentionally separate from general profanity.
// Boundaries protect ordinary names and words that merely contain a short match.
const slurs=[
  'nigg(?:er|a)s?', 'fagg?ots?', 'kikes?', 'chinks?', 'spics?', 'wetbacks?',
  'beaners?', 'gooks?', 'ragheads?', 'towelheads?', 'trann(?:y|ies)',
  'retards?', 'coons?', 'porchmonkeys?', 'spear\\s?chuckers?'
];
const words=new RegExp('(?:^|[^\\p{L}\\p{N}])(?:'+slurs.join('|')+')(?=$|[^\\p{L}\\p{N}])','iu');
const substitutions={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s','!':'i'};
export function noteNeedsRewording(note){
  const text=note.normalize('NFKD').toLowerCase().replace(/\p{M}|\p{Cf}/gu,'');
  if(words.test(text))return true;
  const folded=text.replace(/[013457@$!]/g,c=>substitutions[c])
    .replace(/(?<=\p{L})[.*_\-/]+(?=\p{L})/gu,'')
    .replace(/(?:\b[a-z] ){2,}[a-z]\b/g,run=>run.replaceAll(' ',''));
  return words.test(folded);
}
