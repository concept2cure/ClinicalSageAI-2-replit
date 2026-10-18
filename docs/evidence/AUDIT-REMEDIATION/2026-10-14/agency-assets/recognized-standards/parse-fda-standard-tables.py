from html.parser import HTMLParser
from pathlib import Path
import re,json
class Tables(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack=[]; self.tables=[]; self.table_spans=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
        if tag=='table': self.stack.append({'rows':[],'spans':[],'row':None,'row_spans':None,'cell':None,'cell_span':1})
        if not self.stack:return
        active=self.stack[-1]
        if tag=='tr':active['row']=[];active['row_spans']=[]
        if tag in ('td','th'):
            active['cell']=[]
            active['cell_span']=int(dict(attrs).get('colspan','1'))
        if tag=='br' and active['cell'] is not None:active['cell'].append(' ')
    def handle_data(self,data):
        if self.stack and not self.skip and self.stack[-1]['cell'] is not None:self.stack[-1]['cell'].append(data)
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
        if not self.stack:return
        active=self.stack[-1]
        if tag in ('td','th') and active['cell'] is not None:
            text=' '.join(''.join(active['cell']).split())
            if active['row'] is not None:
                active['row'].append(text);active['row_spans'].append(active['cell_span'])
            active['cell']=None
        if tag=='tr' and active['row'] is not None:
            active['rows'].append(active['row']);active['spans'].append(active['row_spans']);active['row']=None;active['row_spans']=None
        if tag=='table':
            finished=self.stack.pop();rows=finished['rows'];self.tables.append(rows);self.table_spans.append(finished['spans'])
            if self.stack and self.stack[-1]['cell'] is not None:self.stack[-1]['cell'].append(' '.join(' '.join(row) for row in rows))
