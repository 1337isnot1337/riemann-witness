// Targeted English identity slurs, intentionally separate from general profanity.
// Boundaries protect ordinary names and words that merely contain a short match.
const slurs=[
  'nigg(?:er|a)s?', 'fagg?ots?', 'kikes?', 'chinks?', 'spics?', 'wetbacks?',
  'beaners?', 'gooks?', 'ragheads?', 'towelheads?', 'trann(?:y|ies)',
  'retards?', 'coons?', 'porchmonkeys?', 'spear\\s?chuckers?'
];
// Match punctuation as a letter only inside a word. A final "!" still ends it.
const symbolLetters={a:'[a@]',i:'[i!]',s:'[s$]'};
const spellings=slurs.join('|').replace(/\\.|[ais]/g,token=>symbolLetters[token]??token);
const words=new RegExp('(?:^|[^\\p{L}\\p{N}])(?:'+spellings+')(?=$|[^\\p{L}\\p{N}])','iu');
const digits={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t'};
export function noteNeedsRewording(note){
  const text=note.normalize('NFKD').toLowerCase().replace(/\p{M}|\p{Cf}/gu,'')
    .replace(/[013457]/g,c=>digits[c]);
  if(words.test(text))return true;
  const folded=text.replace(/(?<=[\p{L}@$!])[.*_\-/]+(?=[\p{L}@$!])/gu,'')
    .replace(/(?<![\p{L}\p{N}])(?:[a-z@$!] ){2,}[a-z@$!](?![\p{L}\p{N}])/gu,run=>run.replaceAll(' ',''));
  return words.test(folded);
}
