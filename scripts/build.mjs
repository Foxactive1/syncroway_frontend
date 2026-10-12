import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const api = process.env.SYNCROWAY_API;
if (!api || !api.startsWith('https://')) throw new Error('Configure SYNCROWAY_API=https://sua-api/api no deploy.');
const url = new URL(api);
if (url.username || url.password || url.search || url.hash) throw new Error('SYNCROWAY_API deve ser uma URL pública sem credenciais ou query.');
await rm('dist', {recursive: true, force: true}); await mkdir('dist');
for (const name of ['index.html','entrar.html','produto.html','carrinho.html','checkout.html','painel.html','pagamento.html','css','js']) await cp(name, `dist/${name}`, {recursive:true});
await writeFile('dist/runtime-config.js', `window.SYNCROWAY_API = ${JSON.stringify(api.replace(/\/$/, ''))};\n`);
