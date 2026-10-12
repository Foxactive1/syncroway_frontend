import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('all HTML assets and navigation use existing root files', async () => {
  for (const name of (await readdir('.')).filter(n => n.endsWith('.html'))) {
    const html = await readFile(name, 'utf8');
    assert.ok(html.includes('./runtime-config.js'), name);
    assert.ok(!html.includes('/app/'), name);
    for (const [, path] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) await access(path);
  }
});
test('public API ignores stale local override and enforces HTTPS', async () => {
  const src = (await readFile('js/config.js','utf8')).replaceAll('export const', 'var');
  const ctx = {URL, window:{location:{hostname:'market.example',origin:'https://market.example'},SYNCROWAY_API:'https://api.example/api'},localStorage:{getItem:()=> 'http://127.0.0.1:5000/api'}};
  runInNewContext(src,ctx); assert.equal(ctx.API_BASE,'https://api.example/api');
  assert.throws(()=>runInNewContext(src,{...ctx,window:{...ctx.window,SYNCROWAY_API:'http://api.example/api'}}));
});
test('checkout sends no freight and offers payment continuation', async () => {
  const src=await readFile('js/checkout.js','utf8');
  assert.ok(!src.includes('data-fee-store'));
  assert.ok(!src.includes('payload.delivery_fee'));
  assert.ok(src.includes('pagamento.html?ids='));
  assert.ok(!src.includes('Pedido confirmado!'));
});
