from pathlib import Path
from importlib.machinery import SourceFileLoader
import csv,io,re,json,hashlib
Tables=SourceFileLoader('tables',str(Path(__file__).with_name('parse-fda-standard-tables.py'))).load_module().Tables
import sys
root=Path(sys.argv[1])
csvRows=list(csv.reader(io.StringIO((root/'official-export.csv').read_text())))
assert [h.strip() for h in csvRows[0]]==['Date of Entry','Specialty Task Group Area','Recognition Number','Extent of Recognition','Standard Developing Organization','Standard Designation Number/Date','Title of Standard','Transition Expiration Date']
records={}
for row in csvRows[1:]:
    if not row:continue
    assert len(row)==8
    record=dict(zip([h.strip() for h in csvRows[0]],row));number=record['Recognition Number'].strip()
    assert number
    records.setdefault(number,[]).append(record)
assert len(records)==1738
acquisition=json.loads((root/'details-acquisition.json').read_text())
assert acquisition['complete'] and len(acquisition['records'])==len(records)
byId={r['id']:r for r in acquisition['records']}
assert set(byId)==set(acquisition['expectedRecordIds'])==set(file.stem for file in (root/'details').glob('*.html'))
normalized=[];issues=[];details=[];matched=set()
for file in sorted((root/'details').glob('*.html')):
    identifier=file.stem;parser=Tables();raw=file.read_bytes();parser.feed(raw.decode('utf8'))
    try:
        acquired=byId[identifier]
        assert acquired['exitCode']==0 and acquired['http'].startswith('200 '),'source HTTP acquisition incomplete'
        assert acquired['bytes']==len(raw) and acquired['sha256']==hashlib.sha256(raw).hexdigest(),'source bytes differ from acquisition manifest'
        main=[t for t in parser.tables if any(row and row[0]=='FR Recognition Number' for row in t)]
        assert len(main)==1,'missing or ambiguous SIS table'
        cells=main[0]
        number=next(row[1].strip() for row in cells if row[0]=='FR Recognition Number')
        assert number in records and number not in matched,'missing or duplicate bulk recognition identity'
        frList=next(row[1].strip() for row in cells if row[0]=='FR Recognition List Number')
        assert re.fullmatch(r'\d{3}',frList),'malformed recognition-list ID'
        extent=[row[0].removeprefix('Extent of Recognition').strip() for row in cells if row and row[0].startswith('Extent of Recognition')]
        assert len(extent)==1 and extent[0],'missing extent-of-recognition text'
        publications=[row[0] for row in cells if row and row[0].startswith('Public Law, CFR Citation(s) and Procode(s)')]
        assert len(publications)<=1,'ambiguous product-association section'
        tables=[(t,parser.table_spans[index]) for index,t in enumerate(parser.tables) if t and 'Product Code' in t[0]]
        codes=[];uncoded=[]
        assert len(tables)<=1,'multiple product-code tables'
        if tables:
            assert publications,'product-code table without its source section'
            table,spans=tables[0];header=table[0];column=header.index('Product Code')
            assert header==['Regulation Number','Device Name','Device Class','Product Code'],'unexpected product-code table header'
            for row,rowSpans in zip(table[1:],spans[1:]):
                if len(row)==1 and rowSpans==[len(header)]:
                    assert row[0],'empty spanning citation row'
                    uncoded.append({'cells':row,'colspans':rowSpans});continue
                assert len(row)==len(rowSpans) and all(span>0 for span in rowSpans) and sum(rowSpans)==len(header),'malformed product-code row'
                start=0;code=None
                for cell,span in zip(row,rowSpans):
                    if start<=column<start+span:
                        assert start==column and span==1,'ambiguous product-code column span'
                        code=cell.strip()
                    start+=span
                assert code is not None,'missing product-code column'
                if not code:
                    uncoded.append({'cells':row,'colspans':rowSpans});continue
                assert re.fullmatch(r'[A-Z]{3}',code),'noncanonical published product-code cell '+repr(code)
                if code not in codes:codes.append(code)
            state='published-product-code-table' if codes else 'published-table-with-no-product-code-values'
        elif publications:
            state='published-section-with-no-product-code-table'
        else:
            # A complete, identity-matched SIS may publish no association section.
            # Its absence is source evidence; failed acquisition/parse never becomes [].
            assert any(row and re.match(r'^Standards Development Organizations? ',row[0]) for row in cells),'missing complete SIS organization section'
            assert any(row and re.match(r'^FDA Specialty Task Groups? \(STG\) ',row[0]) for row in cells),'missing complete SIS task-group section'
            state='complete-SIS-with-no-published-product-code-section'
        standardHeaders=[index for index,row in enumerate(cells) if row and row[0]=='Standard']
        assert len(standardHeaders)==1,'missing or ambiguous primary Standard heading'
        primary=cells[standardHeaders[0]+1]
        assert len(primary)==1 and primary[0],'missing primary SIS standard text'
        prefixes=[(r,' '.join((r['Standard Developing Organization']+' '+r['Standard Designation Number/Date']).split())) for r in records[number]]
        # FDA's CSV export removes commas, including those in designations.
        # Identity and adoption matching remain exact apart from this documented transform.
        matches=[r for r,prefix in prefixes if primary[0].replace(',','').startswith(prefix.replace(',','')+' ')]
        assert len(matches)==1,'missing or ambiguous primary designation match in identity-joined SIS'
        source=matches[0]
        prefix=next(prefix for r,prefix in prefixes if r is source)
        positions=[index for index,char in enumerate(primary[0]) if char!=',']
        titleStart=positions[len(prefix.replace(',',''))]
        title=primary[0][titleStart:].strip();assert title
        sisDesignation=primary[0][:titleStart].removeprefix(source['Standard Developing Organization'].strip()).strip()
        entry=next(row[2].removeprefix('Date of Entry').strip() for row in cells if row[0]=='FR Recognition List Number')
        from datetime import datetime
        entryDate=datetime.strptime(entry,'%m/%d/%Y').date().isoformat()
        assert all(datetime.strptime(r['Date of Entry'].strip(),'%m/%d/%Y').date().isoformat()==entryDate for r in records[number]),'CSV and SIS entry-date disagreement'
        standard={'recognitionNumber':number,'sdo':source['Standard Developing Organization'].strip(),'designationNumber':sisDesignation,'title':title,'extentOfRecognition':extent[0],'specialtyTaskGroup':source['Specialty Task Group Area'].strip(),'productCodes':codes,'recognitionListNumber':frList,'officialDateOfEntry':entryDate,'sourceRecordId':identifier,'sourceRecordUrl':f'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/detail.cfm?standard__identification_no={identifier}','publishedAssociationStatus':state}
        transition=source['Transition Expiration Date'].strip()
        if transition:
            from datetime import datetime
            standard['transitionEndDate']=datetime.strptime(transition,'%m/%d/%Y').date().isoformat()
        standard['officialExportDesignations']=[{'sdo':r['Standard Developing Organization'].strip(),'designationNumber':r['Standard Designation Number/Date'].strip(),'title':r['Title of Standard'].strip()} for r in records[number]]
        if uncoded:standard['publishedCitationsWithoutProductCode']=uncoded
        normalized.append(standard);matched.add(number)
        details.append({'sourceRecordId':identifier,'recognitionNumber':number,'recognitionListNumber':frList,'officialDateOfEntry':entryDate,'sha256':hashlib.sha256(raw).hexdigest(),'associationStatus':state,'productCodeCount':len(codes),'publishedUncodedCitationRows':len(uncoded),'exportTitleDiffersFromSIS':title!=source['Title of Standard'].strip(),'exportDesignationDiffersFromSIS':sisDesignation!=source['Standard Designation Number/Date'].strip(),**({'publishedAssociationSectionText':publications[0]} if publications and not codes else {})})
    except Exception as error: issues.append({'sourceRecordId':identifier,'reason':str(error)})
summary={'csvRecords':len(records),'fetchedHtmlFiles':len(list((root/'details').glob('*.html'))),'normalizedRecords':len(normalized),'issueCount':len(issues),'issues':issues,'missingRecognitions':sorted(set(records)-matched),'recognitionLists':sorted(set(r['recognitionListNumber'] for r in normalized)),'publishedProductCodes':len(set(code for r in normalized for code in r['productCodes'])),'recordsWithoutProductCodeTable':sum(r['publishedAssociationStatus']=='published-section-with-no-product-code-table' for r in normalized)}
(root/'normalization-review.json').write_text(json.dumps(summary,indent=2)+'\n')
(root/'record-manifest.json').write_text(json.dumps(details,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ('issues','missingRecognitions')},indent=2));print('issues',issues[:10])
if len(normalized)==len(records) and not issues:
    dataset={'datasetVersion':1,'provenance':{'source':'FDA CDRH Recognized Consensus Standards Database (cumulative published database records)','sourceUrl':'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm','recognitionListNumber':'003–067 (cumulative database snapshot 2026-10-14; individual list IDs retained)','publishedOn':max(r['officialDateOfEntry'] for r in normalized),'publishedOnBasis':'Latest Date of Entry published in the official FDA database; this is not a Federal Register publication date. The separate FR documents page currently ends at List 066 (2026-08-24); one official database record publishes List 067.','retrievedOn':'2026-10-14','retrievedBy':'ClinicalSageAI audit remediation; exact official export and all SIS records verified'},'standards':sorted(normalized,key=lambda r:tuple(int(x) for x in r['recognitionNumber'].split('-')))}
    (root/'fda-recognized-consensus-standards.json').write_text(json.dumps(dataset,indent=2,ensure_ascii=False)+'\n')
    print('Complete normalized candidate written; canonical loader and source qualification still required.')
