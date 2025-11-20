import re, spacy
NLP=spacy.load('en_core_web_sm')
REGEXES={
  'CREDIT_CARD':re.compile(r'\b(?:\d[ -]*?){13,16}\b'),
  'SSN':re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
  'PHONE':re.compile(r'\b\(?\d{3}[)-]? *\d{3}-? *-?\d{4}\b'),
  'EMAIL':re.compile(r'[\w.-]+@[\w.-]+'),
}

MASK='■■■■'

def _regex_redact(text):
    matches=[]
    for name,rx in REGEXES.items():
        for m in rx.finditer(text):
            matches.append((name,m.group()))
            text=text.replace(m.group(),MASK)
    return text,matches

def redact(text:str):
    if not text: return text,[]
    text,m=_regex_redact(text)
    doc=NLP(text)
    for ent in doc.ents:
        if ent.label_ in ['PERSON','GPE','DATE']:  # basic PHI
            m.append((ent.label_,ent.text))
            text=text.replace(ent.text,MASK)
    return text,m
