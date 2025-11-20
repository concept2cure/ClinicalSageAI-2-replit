from saml2 import BINDING_HTTP_REDIRECT, BINDING_HTTP_POST
from saml2.client import Saml2Client
from saml2.config import SPConfig
from starlette.responses import RedirectResponse
from fastapi import Request, HTTPException
from ind_automation import saml_creds

BASE_URL = "https://trialsage.ai"  # override via env if needed


def _sp_config(org):
    cfg = saml_creds.load(org)
    if not cfg:
        raise HTTPException(400, "SAML not configured for org")
    saml_settings = {
        "entityid": cfg["sp_entity_id"],
        "service": {
            "sp": {
                "endpoints": {
                    "assertion_consumer_service": [(cfg["acs_url"], BINDING_HTTP_POST)]
                },
                "allow_unsolicited": True,
            }
        },
        "metadata": {
            "inline": [
                {
                    "entityid": cfg["idp_entity_id"],
                    "single_sign_on_service": [
                        {"binding": BINDING_HTTP_REDIRECT, "location": cfg["idp_sso_url"]}
                    ],
                    "x509cert": cfg["idp_x509"],
                }
            ]
        },
        "debug": False,
    }
    c = SPConfig()
    c.load(saml_settings)
    return c


def login_redirect(org, relay_state="/"):
    client = Saml2Client(config=_sp_config(org))
    reqid, info = client.prepare_for_authenticate(relay_state=relay_state)
    for key, value in info["headers"]:
        if key == "Location":
            return value
    raise HTTPException(500, "Unable to build SAML redirect")


async def acs_process(org, request: Request):
    client = Saml2Client(config=_sp_config(org))
    data = await request.body()
    auth_resp = client.parse_authn_request_response(
        data.decode(), BINDING_HTTP_POST, outstanding=None
    )
    if auth_resp is None or auth_resp.ava is None:
        raise HTTPException(401, "Invalid SAML response")
    return auth_resp.ava, auth_resp.name_id.text
