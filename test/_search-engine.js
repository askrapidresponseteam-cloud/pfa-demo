const fs=require('fs'),vm=require('vm');
const {createDocument}=require('./_dom-shim.js');
function load(file){
  const doc=createDocument('<html><body></body></html>');
  const win={document:doc,location:{search:'',hash:'',pathname:'/index.html',href:'https://x/'},navigator:{},history:{replaceState(){},pushState(){}},
   sessionStorage:{_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}},localStorage:null,
   matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},removeEventListener(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,
   console,JSON,Math,Date,Number,String,Boolean,Array,Object,RegExp,Error,parseInt,parseFloat,isNaN,encodeURIComponent,decodeURIComponent,Promise,Map,Set,Intl,URL,URLSearchParams,
   fetch:()=>Promise.resolve({ok:false,json:()=>Promise.resolve({})})};
  win.window=win;win.self=win;win.globalThis=win;doc.defaultView=win;
  const ctx=vm.createContext(win);
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  return win.PFASearch;
}
module.exports=load;
if(require.main===module){
  const S=load(process.argv[2]);
  const qs=['reportcruelty','hosptial','colony caregivr card','fedding dogs','how to adopt','donte','laws dog bite','shp','cruality report','vet near me','abandon','xyzzy'];
  qs.forEach(q=>{const r=S.search(q,{limit:3});console.log(JSON.stringify(q).padEnd(24),'->',(r.via||'exact').padEnd(9),r.rows.map(x=>x.t).slice(0,2).join(' | ')||'(nothing)');});
}
