import React from 'react';

    export function exportCSV(rows){const csv=['Timestamp,Message'];rows.forEach(r=>csv.push(`${r.timestamp},${r.msg||r.type}`));const blob=new Blob([csv.join('
')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='panel.csv';a.click();}

export default function SidePanel({open,onClose,children}){
 if(!open) return null;
 return(<div className='fixed inset-0 z-50 flex'>
  <div className='flex-1 bg-black/40' onClick={onClose}/>
  <div className='w-96 bg-white p-4 overflow-y-auto'>
    <button className='float-right text-xl' onClick={onClose}>×</button>
    {children}
  </div></div>);
}
