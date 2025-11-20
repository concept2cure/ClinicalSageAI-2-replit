import requests

FAERS_API_URL = "https://api.fda.gov/drug/event.json"

def get_faers_data(ndc_code, limit=100):
    response = requests.get(f"{FAERS_API_URL}?search=openfda.product_ndc:\"{ndc_code}\"&limit={limit}")
    return response.json()