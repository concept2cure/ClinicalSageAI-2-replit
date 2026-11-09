// Creates the walk's projects through the product's own API (POST /api/c2c/projects), as the S11 walk did.
const B='http://127.0.0.1:5100';
const a=await (await fetch(`${B}/api/auth/dev-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'jm.smith@concept2cure.pro'})})).json();
const h={Authorization:`Bearer ${a.accessToken}`,'x-organization-id':'1','Content-Type':'application/json'};
const list=(await (await fetch(`${B}/api/c2c/projects?limit=100`,{headers:h})).json()).data??[];
const want=[
  ['WALK-GS-IND', { programType:'ind', productType:'drug', indication:'Walk indication', targetSubmissionDate:'2027-02-01' }],
  ['WALK-GS-510K', { programType:'510k', indication:'Walk device indication', targetSubmissionDate:'2027-04-30' }],
  ['WALK-GS-NDA', { programType:'nda', productType:'drug', indication:'Walk NDA indication', targetSubmissionDate:'2027-09-15' }],
  ['WALK-GS-NOTARGET', { programType:'ind', productType:'drug', indication:'Walk indication' }],
];
for (const [name, body] of want) {
  const found=list.find(p=>p.title===name); if (found) { console.info('exists', name, found.id); continue; }
  const r=await fetch(`${B}/api/c2c/projects`,{method:'POST',headers:h,body:JSON.stringify({name,productName:name,primaryAgency:'FDA',...body})});
  const j=await r.json(); console.info(r.status, name, j.data?.id ?? JSON.stringify(j).slice(0,200));
}
