export async function measure(page){
  return page.evaluate(()=>{
    const dimensions=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};};
    const ed=document.querySelector('.ProseMirror[contenteditable="true"]');let visible=null;if(ed){const r=ed.getBoundingClientRect();let x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(window.innerWidth,r.right),bottom=Math.min(window.innerHeight,r.bottom);for(let ancestor=ed.parentElement;ancestor;ancestor=ancestor.parentElement){const style=window.getComputedStyle(ancestor);if(/(auto|scroll|hidden|clip)/.test(style.overflowX+style.overflowY)){const a=ancestor.getBoundingClientRect();x=Math.max(x,a.left);y=Math.max(y,a.top);right=Math.min(right,a.right);bottom=Math.min(bottom,a.bottom);}}visible={x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};}
    return {visibleEditableViewport:visible,viewport:{width:window.innerWidth,height:window.innerHeight},page:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},canvas:dimensions('[data-testid="dc-expanded"]'),editor:dimensions('.ProseMirror[contenteditable="true"]'),documentScroll:dimensions('.ed-doc-scroll'),editorScroll:dimensions('.rse-scroll'),sectionHeading:dimensions('.ed-mast'),editorCount:document.querySelectorAll('.ProseMirror[contenteditable="true"]').length};
  });
}
export async function accessibility(page){
  await page.addScriptTag({path:'/workspace/scratch/editor-ui-tools/node_modules/axe-core/axe.min.js'});
  return page.evaluate(async()=>{
    const r=await window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
    return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),passes:r.passes.length};
  });
}
