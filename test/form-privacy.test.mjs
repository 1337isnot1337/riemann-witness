import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {home,utility} from '../src/pages.js';
import {REGISTRY_OPEN,SITE} from '../src/config.js';

test('signing and recovery fields remain disabled until their client handler is installed', async () => {
  const origin=new URL(SITE).origin;
  for(const [response,id] of [[home(origin),'register'],[utility(origin,'recover'),'recover']]){
    const html=await response.text();
    const form=html.match(new RegExp('<form\\b[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</form>'));
    assert.ok(form);
    assert.match(form[0], /method="post"/);
    const fields=form[1].match(/<fieldset[^>]*data-form-fields disabled>([\s\S]*?)<\/fieldset>/);
    assert.ok(fields);
    assert.match(fields[1], /name="email"/);
    assert.match(fields[1], /name="phrase"/);
    assert.doesNotMatch(form[1].replace(fields[0],''), /<(?:input|button)\b/);
  }
});

test('the static launch points to the shipped scripts and styles and forbids native form posts', {skip:!REGISTRY_OPEN}, async () => {
  for(const path of ['index.html','launch/index.html','history/index.html']){
    const html=await readFile('dist/pages/'+path,'utf8');
    assert.match(html,/<meta http-equiv="Content-Security-Policy" content="[^"]*form-action 'none'/);
    for(const file of ['app.js','style.css']){
      const bytes=await readFile('dist/pages/'+file);
      const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
      assert.ok(html.includes(file+'?v='+hash+'"'));
    }
  }
});
