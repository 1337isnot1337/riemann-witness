import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {SITE} from '../src/config.js';

const accountTag='28d8fc6696cc5fe0c13d428e8eb95209';
const siteTag='066088a1a44c478b8b6e1846b54b44b9';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const day=86400000;
const iso=time=>new Date(time).toISOString().replace(/\.\d{3}Z$/,'Z');
const date=time=>iso(time).slice(0,10);
const dayStart=time=>Math.floor(time/day)*day;
const usage='Usage: node scripts/analytics.mjs [--holding | --launch YYYY-MM-DDTHH:MM:SSZ] [--days 1-90]';
const graphql=`query($accountTag: string, $filter: filter) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      rumPageloadEventsAdaptiveGroups(limit: 90, filter: $filter, orderBy: [date_ASC]) {
        dimensions { date }
        count
        sum { visits }
      }
    }
  }
}`;

async function analyticsToken(){
  if(process.env.CLOUDFLARE_ANALYTICS_API_TOKEN)return process.env.CLOUDFLARE_ANALYTICS_API_TOKEN;
  try{
    const auth=JSON.parse(execFileSync('cf',['auth','whoami','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    if(!auth.authenticated||!auth.tokenValid||!auth.accounts.some(account=>account.id===accountTag))throw Error();
    const config=join(process.env.XDG_CONFIG_HOME||join(homedir(),'.config'),'cloudflare','config',auth.profile.name+'.json');
    const {oauth_token}=JSON.parse(await readFile(config,'utf8'));
    if(oauth_token)return oauth_token;
  }catch{
    // An account-scoped token also works on machines with a different CLI credential store.
  }
  throw Error('Authenticate with cf or supply CLOUDFLARE_ANALYTICS_API_TOKEN with Account Analytics Read.');
}

async function traffic(token,start,end){
  if(start>=end)return new Map();
  const filter={siteTag,requestHost:new URL(SITE).hostname,bot:0,datetime_geq:iso(start),datetime_lt:iso(end)};
  const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query:graphql,variables:{accountTag,filter}}),signal:AbortSignal.timeout(30000)
  });
  const body=await response.json();
  if(!response.ok||body.errors?.length)throw Error('Cloudflare Web Analytics: '+(body.errors?.map(error=>error.message).join(', ')||response.status));
  const rows=body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if(!Array.isArray(rows))throw Error('Cloudflare Web Analytics did not return traffic for the account.');
  return new Map(rows.map(row=>[row.dimensions.date,{visits:row.sum.visits,pageViews:row.count}]));
}

function issuance(start,end){
  const sql=`SELECT day_utc, certificates FROM certificate_issuance_daily
    WHERE day_utc >= '${date(start)}' AND day_utc <= '${date(end)}' ORDER BY day_utc`;
  const [response]=JSON.parse(execFileSync('wrangler',['d1','execute','riemann-witness','--remote','--json','--command',sql],
    {cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
  if(!response?.success||!Array.isArray(response.results))throw Error('D1 did not return the certificate issuance totals.');
  return new Map(response.results.map(row=>[row.day_utc,row.certificates]));
}

const rate=(certificates,visits)=>visits?(100*certificates/visits).toFixed(2):'—';
function show(label,start,end,trafficRows,issuanceRows){
  if(start>=end)return;
  const rows=[];
  let visits=0,pageViews=0,certificates=0;
  for(let time=dayStart(start);time<end;time+=day){
    const key=date(time),traffic=trafficRows.get(key)||{visits:0,pageViews:0};
    const issued=issuanceRows?.get(key)||0;
    visits+=traffic.visits;
    pageViews+=traffic.pageViews;
    certificates+=issued;
    rows.push({'UTC day':key,Visits:traffic.visits,'Page views':traffic.pageViews,
      ...(issuanceRows?{Certificates:issued,'Certificates per 100 visits':rate(issued,traffic.visits)}:{})});
  }
  rows.push({'UTC day':'Total',Visits:visits,'Page views':pageViews,
    ...(issuanceRows?{Certificates:certificates,'Certificates per 100 visits':rate(certificates,visits)}:{})});
  console.log(`\n${label}  ${iso(start)} through ${iso(end)} UTC (end excluded)`);
  console.table(rows);
}

async function main(){
  const {values}=parseArgs({options:{launch:{type:'string'},holding:{type:'boolean'},days:{type:'string',default:'7'},help:{type:'boolean'}}});
  if(values.help){console.log(usage);return;}
  let input=values.holding?undefined:values.launch||process.env.REGISTRY_LAUNCH_UTC;
  if(!values.holding&&!input){
    try{
      input=(await readFile(join(cwd,'docs/launch-utc.txt'),'utf8')).trim();
    }catch(error){
      if(error.code!=='ENOENT')throw error;
    }
  }
  const launch=input?Date.parse(input):undefined;
  const days=Number(values.days);
  const end=Math.floor(Date.now()/1000)*1000;
  if((values.holding&&values.launch)||(!values.holding&&!input)||
    (input&&(!Number.isFinite(launch)||iso(launch)!==input||launch>=end))||
    !Number.isInteger(days)||days<1||days>90)throw Error(usage);
  const start=dayStart(end)-(days-1)*day;
  const cutoff=launch===undefined?end:Math.max(start,launch);
  const token=await analyticsToken();
  const [holdingRows,openRows]=await Promise.all([traffic(token,start,cutoff),traffic(token,cutoff,end)]);
  const certificates=cutoff<end?issuance(cutoff,end):undefined;
  show('Holding page',start,cutoff,holdingRows);
  show('Open registry',cutoff,end,openRows,certificates);
  console.log('Current UTC day is partial. Traffic can arrive late or be missed by blocked beacons.');
  if(certificates)console.log('Certificates per 100 visits compares aggregate totals. The launch-day certificate count includes the UTC day.');
}

main().catch(error=>{
  if(error.code==='ENOENT'||error.stderr)console.error('D1 totals unavailable. Check that Wrangler is installed, authenticated and can read the migrated database.');
  else console.error(error.message);
  process.exitCode=1;
});
