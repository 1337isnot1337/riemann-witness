import {readFile} from 'node:fs/promises';
import {API} from '../src/config.js';

async function removeNote(args, env) {
  const [number] = args;
  const id = Number(number);
  if (args.length !== 1 || !/^0*[1-9]\d*$/.test(number) || !Number.isSafeInteger(id)) {
    throw new Error('Run node scripts/remove-note.mjs WITNESS_NUMBER using the number on the badge.');
  }

  let origin;
  try {
    origin = new URL(env.WORKER_ORIGIN || API);
  } catch {
    throw new Error('Set WORKER_ORIGIN to the registry Worker origin.');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:')) ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Use a bare HTTPS Worker origin or a loopback preview origin.');
  }

  let token = env.ADMIN_TOKEN;
  if (!token && env.RIEMANN_ADMIN_SECRETS_FILE) {
    try {
      token = JSON.parse(await readFile(env.RIEMANN_ADMIN_SECRETS_FILE, 'utf8')).ADMIN_TOKEN;
    } catch {
      throw new Error('Could not read the private admin secrets file.');
    }
  }
  if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('Set ADMIN_TOKEN or point RIEMANN_ADMIN_SECRETS_FILE to a private JSON file containing it.');
  }

  let response;
  try {
    response = await fetch(new URL('/api/admin/' + id + '/note', origin), {
      method: 'DELETE',
      headers: {Authorization: 'Bearer ' + token},
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('The Worker could not confirm note removal. Check the origin and try the same number again.');
  }
  if (response.status === 404) throw new Error('Witness number or admin credential unavailable.');
  if (!response.ok) throw new Error('The Worker declined note removal with HTTP ' + response.status + '.');

  const result = await response.json().catch(() => null);
  if (result?.ok !== true) throw new Error('The Worker returned an unexpected response.');
  console.log('Removed the note on witness #' + String(id).padStart(6, '0') + '.');
}

try {
  await removeNote(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
