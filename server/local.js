import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {handleApi} from './api.js';
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/local-development' && process.env.NODE_ENV !== 'production') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ localDevelopment: true }));
  }
  if(url.pathname.startsWith('/api/')) return handleApi(req,res);
  try {
    const decoded=decodeURIComponent(url.pathname);
    if(decoded.split('/').some(segment=>segment.startsWith('.'))) {res.writeHead(404);return res.end();}
    let target=path.resolve(root,'.'+decoded);
    if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(404);return res.end();}
    if((await stat(target)).isDirectory())target=path.join(target,'index.html');
    const info=await stat(target);if(!info.isFile())throw new Error();
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    createReadStream(target).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||8788),'127.0.0.1',()=>console.log(`TPW demo: http://localhost:${process.env.PORT||8788}/dashboard/`));
