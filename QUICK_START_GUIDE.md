# CERV2 510(k) Workflow - Quick Start Guide

## For Medical Device Clients

### Accessing the Application

1. **Open Browser**: Navigate to http://localhost:5000
2. **Login**: Use your client credentials
3. **Navigate to CERV2**: Click on "CERV2" in the navigation menu

### Complete a 510(k) Submission

#### Step 1: Create Device Profile (5-10 minutes)

**What to prepare:**
- Device name and model number
- Manufacturer information
- Device classification (Class I, II, or III)
- Product code (3-letter FDA code)
- Intended use statement (minimum 50 characters)
- Technical description
- Contact information

**In the app:**
1. Go to "Device Intake" tab
2. Fill out the Enhanced Device Profile Form
3. Use tabs to organize information:
   - Basic Information (required)
   - Technical Details (recommended)
   - Contact Info (optional)
4. Watch the completion meter - aim for 70% minimum
5. Click "Save Draft" to save progress
6. Click "Create Device Profile" when ready

**Tips:**
- Intended use must be at least 50 characters for adequate detail
- Email addresses are validated automatically
- Drafts are saved to your browser's local storage

---

#### Step 2: Search for Predicate Devices (10-15 minutes)

**What you need:**
- Your device profile (from Step 1)
- Knowledge of similar devices on the market
- Product codes of potential predicates

**In the app:**
1. Go to "Predicates" tab
2. Use the Predicate Finder Panel to search FDA database
3. Enter search criteria (product code, device name, etc.)
4. Review AI-ranked results
5. Select the best matching predicate device
6. Review predicate device details

**Tips:**
- AI ranking considers technological similarity
- Look for devices with same intended use
- Recent clearances (last 5 years) are preferred
- Check if predicate is still marketed

---

#### Step 3: Run Equivalence Analysis (Automatic - 2 minutes)

**What happens:**
- AI compares your device with the predicate
- Analyzes technological characteristics
- Compares performance specifications
- Identifies key similarities and differences
- Provides regulatory recommendations

**In the app:**
1. Go to "Equivalence" tab
2. Analysis runs automatically when both devices are selected
3. Review the Equivalence Analysis Dashboard:
   - **Overview**: Overall score and key points
   - **Technology**: Characteristic-by-characteristic comparison
   - **Performance**: Performance metrics comparison
   - **Risk**: Risk assessment
   - **Recommendations**: Next steps for submission

**Understanding the score:**
- **80%+**: Strong equivalence (green) - Excellent foundation
- **60-79%**: Moderate equivalence (yellow) - May need additional testing
- **<60%**: Weak equivalence (red) - Consider different predicate

**Tips:**
- Document all differences identified
- Note recommendations for additional testing
- Export report for your quality team
- Address differences in your submission strategy

---

#### Step 4: Compliance Check (Automatic - 1 minute)

**What it checks:**
- Essential Elements (21 CFR 807.87)
- Labeling Requirements (21 CFR 801)
- Performance Testing needs
- Biocompatibility requirements (ISO 10993)
- Sterilization validation (if applicable)

**In the app:**
1. Go to "Compliance" tab
2. Compliance check runs automatically
3. Review the Compliance Dashboard:
   - Overall compliance score
   - Category-by-category breakdown
   - Critical issues (must fix)
   - Warnings (should address)
   - Action items with checkboxes

**Compliance categories:**
- **90%+**: Fully Compliant (green)
- **70-89%**: Mostly Compliant (yellow)
- **<70%**: Non-Compliant (red)

**Tips:**
- Address critical issues first
- Use checkboxes to track action items
- Each requirement references specific FDA regulations
- Export compliance report for quality review

---

#### Step 5: Generate Submission Package (15-20 minutes)

**Required documents (10 total):**
1. FDA Cover Letter (Form 3514)
2. Device Description
3. Substantial Equivalence Discussion
4. Indications for Use (Form 3881)
5. Labeling (IFU, warnings, contraindications)
6. Performance Testing results
7. Biocompatibility Evaluation (if applicable)
8. Software Documentation (if applicable)
9. Sterilization Validation (if applicable)
10. Risk Analysis (ISO 14971)

**In the app:**
1. Go to "Submission" tab
2. Review the Submission Package Builder
3. Check/uncheck documents to include
4. Click "Download" next to each document to generate
5. Review generated documents
6. Click "Download Package" to get complete ZIP file
7. Click "Mark Ready for Submission" when 100% complete

**Package progress:**
- **100%**: All documents generated - ready to submit
- **50-99%**: In progress - continue generating documents
- **<50%**: Just started - more work needed

**Tips:**
- Generate documents in order (cover letter first)
- Review each document for accuracy
- Have your quality team approve before finalizing
- Keep original editable versions for revisions

---

### Using Demo Data

**For presentations and training:**

```javascript
// Load a demo scenario at 65% completion
import { mockDemoData } from '@/data/mockDemoData';

const scenario = mockDemoData.scenarios.find(s => 
  s.completionPercentage === 65
);
```

**Available demo scenarios:**
- 5%: Basic device info only
- 20%: Device + predicate search started
- 35%: Partial equivalence analysis
- 50%: Equivalence complete
- 65%: Compliance check done
- 80%: Most documents generated
- 95%: Ready for submission

**Demo devices included:**
- CardioMonitor Pro (cardiac monitoring, Class II)
- InsulinPump Advanced (diabetes management, Class III)
- BloodGlucose Smart (glucose monitoring, Class II)
- PulseOx Plus (oxygen saturation, Class II)

---

### Keyboard Shortcuts

- **Tab**: Navigate between form fields
- **Ctrl+S**: Save draft (in device profile)
- **Esc**: Close modal dialogs
- **Ctrl+P**: Print/Export current view

---

### Export Options

All components support exporting:

1. **Equivalence Analysis**: Click "Export Report" button
2. **Compliance Check**: Click "Export Report" button
3. **Submission Package**: Click "Download Package" for ZIP file
4. **Individual Documents**: Click download icon next to each document

---

### Getting Help

**Documentation:**
- Comprehensive Guide: `/CERV2_510K_WORKFLOW_GUIDE.md`
- Deployment Details: `/CERV2_DEPLOYMENT_SUMMARY.md`

**API Testing:**
```bash
./test-510k-api.sh
```

**Server Logs:**
```bash
tail -f server.log
```

---

### Best Practices

1. **Complete device profile fully** (aim for 100%)
2. **Choose predicate carefully** (best technological match)
3. **Address all compliance issues** before generating documents
4. **Review all documents** with quality team
5. **Keep backups** of all generated documents
6. **Track versions** for audit trail

---

### Regulatory Tips

1. **Intended Use**: Be specific but not too narrow
2. **Predicate Selection**: Recent clearances preferred
3. **Equivalence**: Focus on similarities, explain differences
4. **Testing**: Follow FDA guidance documents
5. **Labeling**: Include all required warnings
6. **Submission**: Use eCopy format for electronic submission

---

### Timeline Estimates

- **Device Profile**: 1-2 hours (first time), 30 min (updates)
- **Predicate Search**: 2-4 hours research, 30 min selection
- **Equivalence Analysis**: Automatic (2 min) + review (1 hour)
- **Compliance Check**: Automatic (1 min) + remediation (varies)
- **Document Generation**: 2-4 weeks total compilation time
- **Quality Review**: 1-2 weeks before submission
- **FDA Review**: 90 days (target for traditional 510(k))

---

### Success Metrics

**Your submission is ready when:**
- ✅ Device profile 100% complete
- ✅ Predicate device identified and documented
- ✅ Equivalence score 80%+ (or differences well-explained)
- ✅ Compliance score 90%+ (all critical issues resolved)
- ✅ All 10 required documents generated
- ✅ Quality team has approved package
- ✅ Submission package downloaded and backed up

---

## Quick Troubleshooting

**Problem**: Can't create device profile
- **Solution**: Check that all required fields are filled
- **Check**: Email format is valid
- **Note**: Intended use needs 50+ characters

**Problem**: Equivalence score is low
- **Solution**: Consider different predicate
- **Alternative**: Document and test all differences
- **Note**: 60%+ is acceptable with good justification

**Problem**: Compliance issues flagged
- **Solution**: Address critical issues first
- **Review**: Check specific FDA regulation referenced
- **Action**: Complete action items in checklist

**Problem**: Can't download package
- **Solution**: Ensure at least 50% documents generated
- **Check**: All required documents are checked
- **Note**: 100% required to mark "Ready for Submission"

---

## Contact Support

- **Technical Issues**: Check server logs
- **Workflow Questions**: See comprehensive guide
- **Regulatory Questions**: Consult your regulatory affairs team
- **System Status**: http://localhost:5000/health (if enabled)

---

**Version**: 2.0.0  
**Last Updated**: 2025-12-31  
**Status**: Production Ready ✅
