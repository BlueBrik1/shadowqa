// Runs INSIDE the network-disabled sandbox. Files are the only bridge to the host.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root='/bridge';
for(const p of ['api-in','api-out','model-in','model-out'])await mkdir(`${root}/${p}`,{recursive:true});
async function atomic(file,data){const temp=file+'.tmp';await writeFile(temp,JSON.stringify(data));await rename(temp,file);}
const model=http.createServer(async(req,res)=>{
  let input='';for await(const chunk of req){input+=chunk;if(input.length>2_000_000){res.writeHead(413).end();return;}}
  if(req.method!=='POST'||!/^\/v1beta\/models\/[\w.-]+:(?:generateContent|streamGenerateContent|countTokens)(?:\?alt=sse)?$/.test(req.url??'')){res.writeHead(403).end();return;}
  const id=randomUUID();await atomic(`${root}/model-in/${id}.json`,{id,path:req.url,body:input});
  const deadline=Date.now()+120_000;
  while(Date.now()<deadline){try{const reply=JSON.parse(await readFile(`${root}/model-out/${id}.json`,'utf8'));await unlink(`${root}/model-out/${id}.json`);res.writeHead(reply.status,{'content-type':reply.contentType??'application/json'});res.end(reply.body);return;}catch(e){if(e.code!=='ENOENT'){res.writeHead(502).end();return;}}await sleep(100);}
  res.writeHead(504).end('{"error":{"message":"ShadowQA model bridge timed out"}}');
});
model.listen(3001,'127.0.0.1');
const child=spawn('opencode',['serve','--hostname','127.0.0.1','--port','4096'],{cwd:'/workspace',env:process.env,stdio:['ignore','inherit','inherit']});
child.on('exit',code=>process.exit(code??1));
const pending=new Set();
async function dispatch(file){
  const full=`${root}/api-in/${file}`;let request;
  try{request=JSON.parse(await readFile(full,'utf8'));await unlink(full);}catch{return;}
  const {id,method,path,body}=request;
  if(!/^[a-f0-9-]{36}$/.test(id)||!String(path).startsWith('/')||String(path).includes('://'))return;
  let sequence=0;
  try{
    const response=await fetch('http://127.0.0.1:4096'+path,{method,headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},body:['GET','HEAD'].includes(method)?undefined:body,signal:AbortSignal.timeout(3600_000)});
    await atomic(`${root}/api-out/${id}.${sequence++}.json`,{status:response.status,contentType:response.headers.get('content-type')});
    let size=0;for await(const chunk of response.body??[]){size+=chunk.length;if(size>8_000_000)break;await atomic(`${root}/api-out/${id}.${sequence++}.json`,{chunk:Buffer.from(chunk).toString('base64')});}
    await atomic(`${root}/api-out/${id}.${sequence}.json`,{done:true});
  }catch{await atomic(`${root}/api-out/${id}.${sequence}.json`,{error:'OpenCode backend unavailable',done:true});}
}
setInterval(async()=>{for(const file of await readdir(`${root}/api-in`)){if(!/^[a-f0-9-]{36}\.json$/.test(file)||pending.has(file))continue;pending.add(file);dispatch(file).finally(()=>pending.delete(file));}},100);
