import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const files = ['server/routes/ana-ri/stream.ts','server/routes/chat/send-message.ts','server/services/ana-ri/chat-context-builder.ts','server/services/ana-ri/context-blocks.ts'];
const eslint = new ESLint();
const metrics = messages => messages.filter(m => ['complexity','max-lines','max-lines-per-function','max-depth'].includes(m.ruleId)).map(m => ({rule:m.ruleId,kind:m.message.replace(/\d+/g,'#'),value:Number(m.message.match(/(?:complexity of|lines \(|deeply \()\s*(\d+)/)?.[1])}));
const results=[];
for(const file of files){
 const [before] = await eslint.lintText(execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}),{filePath:resolve(file)});
 const [after] = await eslint.lintText(readFileSync(file,'utf8'),{filePath:resolve(file)});
 const oldMetrics=metrics(before.messages),newMetrics=metrics(after.messages);
 const growth=newMetrics.filter(m=>!oldMetrics.some(o=>o.rule===m.rule&&o.kind===m.kind&&o.value>=m.value));
 results.push({file,beforeErrors:before.errorCount,afterErrors:after.errorCount,beforeWarnings:before.warningCount,afterWarnings:after.warningCount,beforeMetrics:oldMetrics,afterMetrics:newMetrics,metricGrowth:growth});
}
writeFileSync(new URL('./lint-comparison.json',import.meta.url),JSON.stringify({results},null,2)+'\n');
console.info(JSON.stringify(results.map(({file,beforeWarnings,afterWarnings,metricGrowth})=>({file,beforeWarnings,afterWarnings,metricGrowth}))));
process.exitCode=results.some(r=>r.afterErrors||r.afterWarnings>r.beforeWarnings||r.metricGrowth.length)?1:0;
