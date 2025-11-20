import asyncio, os, datetime, io
from fastapi.responses import StreamingResponse
from playwright.async_api import async_playwright
from ind_automation import branded_pdf

async def render_pdf(url):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url, wait_until='networkidle')
        pdf_bytes = await page.pdf(format='Letter')
        await browser.close()
        return pdf_bytes

def insights_pdf_endpoint(org:str):
    url=f"{os.getenv('BASE_URL','http://localhost:3000')}/#/insights?org={org}&print=1"
    pdf=asyncio.run(render_pdf(url))
    org_name=os.getenv("ORG_NAME",org)
    branded=branded_pdf.brand_pdf(pdf,org_name)
    filename=f"Insights_{org}_{datetime.date.today()}.pdf"
    return StreamingResponse(branded,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename={filename}'})
