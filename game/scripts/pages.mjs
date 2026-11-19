import {cp,mkdir,rm,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),output=new URL('pages/',root);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp(new URL('dist/',root),output,{recursive:true});
await writeFile(new URL('.nojekyll',output),'');
const source=new URL('game/',output);await mkdir(source);
const excluded=new Set(['.git','.openai','node_modules','dist','pages','.DS_Store']);
for(const entry of await readdir(root,{withFileTypes:true}))if(!excluded.has(entry.name)&&!entry.name.startsWith('.env'))await cp(new URL(entry.name,root),new URL(entry.name,source),{recursive:true});
await writeFile(new URL('README.md',output),`# Cube Chaos

Игра: https://meidelg.github.io/cube-chaos/

В корне лежит готовая автономная сборка для GitHub Pages (ветка main, папка /).
Полные исходники, тесты и библиотека примеров находятся в [game/](game/).

## Разработка и обновление

\`\`\`sh
cd game
npm ci
npm test
npm run build:pages
\`\`\`

Папка game/pages содержит новый корень репозитория: сборку и обновлённые исходники.
Замените файлы готовой сборки в корне содержимым этой папки; LICENSE сохраняется.
Иконки, manifest, чанки и Service Worker используют относительные пути и поддерживают /cube-chaos/.
`);
console.log('GitHub Pages package:',fileURLToPath(output));
