# ✅ TrialSage Replit Deployment Checklist (April 2025)

This checklist enables full deployment of TrialSage's Study Design Intelligence Engine inside Replit. All backend components are now Replit-optimized and ready to run.

---

## ✅ Project Structure

```
/trialsage/
├── main.py                        # Entrypoint
├── controllers/
│   └── protocol.py                # Unified intelligence controller
├── services/
│   ├── openai_engine.py          # Assistant threads + GPT-4 logic
│   └── report_generator.py       # Weekly intelligence briefing engine
```

---

## ⚙️ Replit Setup Instructions

### 1. **Environment Variables (Set in .env)**

```
OPENAI_API_KEY=sk-...
TRIALSAGE_ASSISTANT_ID=asst-...
MAILGUN_USER=postmaster@yourdomain.com
MAILGUN_PASSWORD=your-mailgun-password
```

### 2. **`.replit` Config**

```toml
entrypoint = "main.py"
[env]
PYTHONUNBUFFERED = "1"

[interpreter]
command = ["python3"]
```

### 3. **Run Command** (if prompted in shell)

```bash
python main.py
```

---

## 🧠 API Summary

| Endpoint                               | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `POST /api/intel/protocol-suggestions` | Generate protocol, IND 2.5, risk, citations, quotes |
| `POST /api/intel/continue-thread`      | Continue design (e.g., 2.7, SAP)                    |
| `POST /api/intel/sap-draft`            | Generate SAP section                                |
| `POST /api/intel/csr-evidence`         | Return CSR-based evidence on any concept            |
| `GET /api/intel/scheduled-report`      | Send complete intelligence briefing (email/cron)    |

---

## 📬 Optional: Replit Scheduler Integration

Use Replit's Tasks interface to schedule weekly GET:

```
GET https://your-replit-url/api/intel/scheduled-report
```

This ensures weekly reports go out even if you're not logged in.

---

## ✅ Final Test Checklist

- [ ] `POST /api/intel/protocol-suggestions` returns protocol + thread ID
- [ ] Weekly report emails to `founder@example.com`
- [ ] `main.py` runs without error
- [ ] `/controllers/protocol.py` imports correctly
- [ ] Replit deployment runs continuously or via Task

---

You're now cleared to deploy TrialSage into the Replit cloud.
Let me know if you'd like help wiring in the frontend or building the PDF export pipeline next.
