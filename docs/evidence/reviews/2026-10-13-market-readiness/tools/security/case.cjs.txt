const express = require('<repo>/node_modules/express');
const http = require('http');
const app = express();
app.use((req,res,next)=>{ const p=(req.path||'').split('?')[0]; req.gate = p.startsWith('/api/') ? 'gated' : 'SKIPPED'; next();});
const r = express.Router(); r.get('/thing', (req,res)=>res.json({gate:req.gate, baseUrl:req.baseUrl, path:req.path}));
app.use('/api/outofscope', r);
const s = app.listen(0, async ()=>{
  const port = s.address().port;
  for (const p of ['/api/outofscope/thing','/API/outofscope/thing','/Api/OutOfScope/thing']) {
    await new Promise(ok=>http.get({port,path:p},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>{console.log(p,res.statusCode,b);ok();});}));
  }
  s.close();
});
