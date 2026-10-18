"""One retained light/private case, preserving actual assertion traceback. No API modification."""
import importlib.util,json,pathlib,sys,traceback
original=pathlib.Path('/tmp/submission-deliverables-browser-prep')
out=original/'diagnostic-one';out.mkdir(mode=0o700,exist_ok=True)
config=json.loads((original/'fixture-identities.json').read_text())
config['fixtures']=[config['fixtures'][0]];config['variants']=[config['variants'][0]]
(out/'fixture-identities.json').write_text(json.dumps(config,indent=2)+'\n')
(out/'current-runtime-path.txt').write_text((original/'current-runtime-path.txt').read_text())
spec=importlib.util.spec_from_file_location('review',original/'review_live.py');review=importlib.util.module_from_spec(spec);spec.loader.exec_module(review)
review.FOLDER=out
visual=review.visual_case

def traced(*args,**kwargs):
    try:return visual(*args,**kwargs)
    except Exception as error:
        trace=error.__traceback__
        details={'exceptionType':type(error).__name__,'traceback':review.safe_error(''.join(traceback.format_exception(error)))}
        while trace:
            if trace.tb_frame.f_code.co_name=='visual_case':
                local=trace.tb_frame.f_locals
                details['line']=trace.tb_lineno
                details['expectedStatusLabel']=local.get('expected_labels',{}).get(local.get('entry',{}).get('status'))
                details['entry']=local.get('entry')
                details['cardText']=local.get('card_text')
                details['observedTheme']=local.get('result',{}).get('shellTheme')
                details['bodyWidth']=local.get('result',{}).get('bodyWidth')
            trace=trace.tb_next
        (out/'actual-assertion-trace.json').write_text(json.dumps(details,indent=2)+'\n')
        raise
review.visual_case=traced
sys.argv=[str(original/'review_live.py'),'--root-approved']
review.main()
