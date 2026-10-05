// Rebuild browser data and standalone HTML after editing JSON / assets.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const data = JSON.parse(await read('wos_rally_joiner_gen1-8.json'));
const dataScript = 'window.WOS_DATA = ' + JSON.stringify(data).replaceAll('</', '<\\/') + ';\n';
await writeFile(path.join(root, 'assets/data.js'), dataScript, 'utf8');
let html = await read('index.html');
html = html.replace('<link rel="stylesheet" href="./assets/app.css">', '<style>' + await read('assets/app.css') + '</style>');
const scripts = ['<script>window.WOS_STANDALONE=true;</script>'];
for (const filename of ['data.js', 'core.js', 'app.js']) {
  const content = filename === 'data.js' ? dataScript : await read('assets/' + filename);
  scripts.push('<script>' + content.replaceAll('</script', '<\\/script') + '</script>');
  html = html.replace(new RegExp(`<script src="\\./assets/${filename}(?:\\?[^\"]*)?" defer></script>`), '');
}
html = html.replace('</body>', scripts.join('\n') + '\n</body>');
await writeFile(path.join(root, 'standalone.html'), html, 'utf8');
console.log(`Built standalone.html and assets/data.js (${data.heroes.length} heroes)`);
