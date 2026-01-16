# 🌐 Browser Testing Guide - Component Integration

**Status**: Ready to test in browser  
**Prerequisites**: npm run dev (dev server running)  
**Time Estimate**: 15-30 minutes  

---

## Quick Start

### Step 1: Start Dev Server
```bash
cd /workspaces/ClinicalSageAI-2-replit
npm run dev
```

Wait for message: "Local: http://localhost:5000"

### Step 2: Navigate to App
Open browser and go to: http://localhost:5000

### Step 3: Go to CERV2
Click "CERV2" or navigate to: http://localhost:5000/cerv2

---

## Test 1: Demo Tab Visibility (2 min)

### Expected UI
- Main navigation bar with multiple tabs
- "Demo" tab with **Lightbulb icon** (purple)
- Tab should be **first in tab bar**

### What to Do
1. Look at the top navigation
2. Find the "Demo" tab (Lightbulb icon)
3. If visible: ✅ PASS
4. If not visible: ❌ FAIL - Check console for errors

### If Test Fails
- Check browser console (F12 → Console tab)
- Look for import errors like "Cannot find IntegratedDemoTab"
- Check if CERV2Page modifications present

---

## Test 2: Demo Tab Click (1 min)

### Expected Behavior
- Click "Demo" tab
- Page updates to show demo content
- No errors in console

### What to Do
1. Click the "Demo" tab (Lightbulb icon)
2. Wait for content to load (should be instant)
3. Look for:
   - "Showcase" and "Interactive" mode buttons
   - Scenario selector buttons (Startup, Midstage, Advanced)
   - Left panel with device dashboard
   - Right panel with device controls

### If Test Fails
- Check console for "IntegratedDemoTab not defined"
- Verify file exists: `/src/components/IntegratedDemoTab.jsx`
- Check import statement in CERV2Page

---

## Test 3: Mode Toggle (2 min)

### Expected Behavior - Showcase Mode
- Left panel shows DemoDashboard
- Displays device progression
- Shows workflow stages
- Read-only (no buttons to change workflow)

### Expected Behavior - Interactive Mode
- Right panel shows DeviceLoaderComponent
- Device list with all devices
- Progress bar showing workflow status
- Device selection buttons
- Load device button

### What to Do
1. Click "Showcase" button - should show dashboard
2. Click "Interactive" button - should show device loader
3. Toggle back and forth
4. Both panels should render correctly

### If Test Fails
- Check if DemoDashboard component renders (left column should be 9/12 width)
- Check if DeviceLoaderComponent renders (right column should be 3/12 width)
- Look for React errors in console

---

## Test 4: Scenario Selection (3 min)

### Expected: Startup Scenario
- Scenario button becomes highlighted
- Device list updates
- Should show 3-4 devices with low completion %
- Devices: BasicStartup (5%), PartialEarly (15%), etc.

### Expected: Midstage Scenario
- Device list changes
- Should show 5-6 devices with medium completion %
- Mix of startup and intermediate devices

### Expected: Advanced Scenario
- Device list changes again
- Should show 7-8 devices with high completion %
- Advanced and near-approved devices

### What to Do
1. Switch to Interactive mode
2. Click "Startup" scenario button
3. Observe device list updates
4. Note device completion percentages
5. Click "Midstage" scenario button
6. Observe device list changes
7. Click "Advanced" scenario button
8. Observe device list changes again

### Progress Bar
- Should show "0/X" initially
- Updates as devices are loaded
- Shows "X/X" when complete

### If Test Fails
- Check that mockDemoData.js exists
- Verify it exports mockDemoScenarios
- Check browser console for data errors

---

## Test 5: Device Selection & Loading (5 min)

### Expected Behavior
- Click on a device in the list
- Device highlights in **blue**
- Shows device details (name, completion %, status)
- Progress bar shows device loading progress
- Click "Load Device" button

### After Load
- Toast notification appears: "Device Loaded"
- Device appears in workflow tabs
- Other tabs (Device Profile, Predicates) show device data
- Progress bar updates

### What to Do
1. In Interactive mode, select Startup scenario
2. Click on first device in list
3. Device should highlight blue
4. Click "Load Device" button
5. Watch for toast notification
6. Check workflow tabs:
   - Click "Device Profile" tab
   - Should see loaded device info
   - Click back to Demo tab

### If Test Fails
- Check for error toast: "Failed to load device"
- Look in console for service errors
- Verify DocumentEditorService is available
- Check FDA510kPipelineService connection

---

## Test 6: Multiple Device Loading (5 min)

### Expected: Load Multiple Devices
1. Select device 1 → Load → Should appear in workflow
2. Select device 2 → Load → Should appear in workflow
3. Both devices should be accessible

### Expected: Scenario Loading
1. Click "Load Scenario" (if available)
2. Should load all devices in scenario
3. Progress bar should show "5/5" for midstage scenario
4. All devices accessible in workflow

### What to Do
1. Load first device (note toast notification)
2. Load second device (note toast notification)
3. Navigate to Device Profile tab
4. Device 2 should be the active one
5. Go back to Demo tab
6. Try loading scenario (if button available)

### If Test Fails
- Check if only last device is remembered
- Verify workflow state management
- Look for "overwriting device" errors in console

---

## Test 7: Export Features (3 min)

### Expected: Export to JSON
- Click "Export as JSON" button
- Browser downloads file: `scenario-[timestamp].json`
- File contains device and scenario data

### Expected: Copy to Clipboard
- Click "Copy to Clipboard" button
- Toast shows "Copied to clipboard"
- Can paste data into text editor

### What to Do
1. Click "Export as JSON" button
2. Check browser downloads
3. File should be present
4. Open file in text editor
5. Should see JSON structure with devices
6. Go back to browser
7. Click "Copy to Clipboard"
8. Open text editor and paste
9. Should see same JSON data

### If Test Fails
- Check browser's export permissions
- Verify file downloads to correct location
- Check console for "Export failed" errors

---

## Test 8: Error Handling (3 min)

### Test Network Error (Advanced)
1. Open DevTools (F12)
2. Go to Network tab
3. Click throttling dropdown
4. Select "Offline"
5. Try to load a device
6. Should see error toast: "Failed to load device"
7. Click throttling dropdown → "Online"
8. Try again → should work

### Test Invalid Device Selection
1. Try to load same device twice
2. Should handle gracefully
3. No console errors

### What to Do
1. Check console for errors
2. Try rapid device loading
3. Try scenario loading multiple times
4. Observe toast notifications appear correctly

### If Test Fails
- Error toast should appear
- Console should show error details
- Should not crash app
- Should allow retry

---

## Visual Checklist

As you test, verify these visual elements:

- [ ] Demo tab has Lightbulb icon (purple)
- [ ] Mode buttons styled correctly (Showcase/Interactive)
- [ ] Scenario buttons show selection state
- [ ] Device list items are clickable
- [ ] Selected device highlighted in blue
- [ ] Progress bar visible and updating
- [ ] Toast notifications appear bottom-right
- [ ] Device dashboard shows in showcase mode
- [ ] Device loader shows in interactive mode
- [ ] Export/Copy buttons visible

---

## Performance Checklist

Verify performance is acceptable:

- [ ] Demo tab opens instantly (< 200ms)
- [ ] Device list loads within 300ms
- [ ] Device loading takes 500-800ms
- [ ] Scenario loading takes 2-3s
- [ ] Export completes within 100ms
- [ ] No UI freezing or lag
- [ ] Smooth animations
- [ ] Responsive buttons

---

## Common Issues & Solutions

### Issue: Demo tab not visible
**Solution**: 
- Refresh page (F5)
- Check console for errors
- Verify CERV2Page has demo tab in k510TabGroups

### Issue: Demo tab doesn't load
**Solution**:
- Check browser console (F12)
- Look for "Cannot find module"
- Verify IntegratedDemoTab.jsx exists
- Restart dev server (npm run dev)

### Issue: Device loading fails
**Solution**:
- Check console for service errors
- Verify mockDemoData.js has device data
- Check if DocumentEditorService is available
- Look for network errors in Network tab

### Issue: Toast notifications not showing
**Solution**:
- Check if toast library is loaded
- Look for "useToast is not defined"
- Verify toast hook is imported correctly

### Issue: Export doesn't work
**Solution**:
- Check browser download settings
- Look for popup blocker issues
- Check console for export errors
- Verify JSON is valid

---

## Data Verification

When you load a device, check if this data appears:

### Device Profile Tab Should Show
- Device name: e.g., "AccuFlow Plus Monitor"
- Manufacturer
- Intended use
- Device classification (Class II, etc.)
- Completion percentage

### Predicates Tab Should Show
- List of predicate devices
- Predicate device names
- 510(k) numbers

### Equivalence Tab Should Show
- Comparison with predicate device
- Design characteristics
- Performance data
- Intended use comparison

### Compliance Tab Should Show
- FDA compliance checklist items
- Performance standards met
- Labeling requirements
- Submission readiness status

---

## Success Criteria

✅ **PASS** if all of these work:
1. Demo tab appears and is clickable
2. Mode toggle switches between showcase and interactive
3. Scenario selector changes device list
4. Device selection highlights correctly
5. Device loading shows toast notification
6. Device appears in other workflow tabs
7. Export to JSON button works
8. Copy to clipboard button works
9. No console errors appear
10. Performance is acceptable (no lag)

❌ **FAIL** if:
- Demo tab missing or broken
- Components don't render
- Device loading errors
- Services don't connect
- Console has red errors
- UI is very slow

---

## Reporting Issues

If you find any issues:

1. **Document the issue**: What happened? What was expected?
2. **Check console**: F12 → Console → Any errors?
3. **Check network**: F12 → Network → Any failed requests?
4. **Screenshot/Recording**: Capture the issue
5. **Report with details**: Include console errors and network info

---

## Next Steps After Testing

### If All Tests Pass ✅
- Integration is **ready for deployment**
- Can proceed to production testing
- Document any UX improvements needed

### If Some Tests Fail ⚠️
- Identify which components are failing
- Check console errors for clues
- Verify all files are in correct locations
- May need code fixes before deployment

### After Deployment
- Continue monitoring for issues
- Gather user feedback
- Optimize based on usage patterns
- Consider feature enhancements

---

## Support

**Questions during testing?**
- Check TESTING_REPORT.md for detailed results
- Review COMPONENT_INTEGRATION_GUIDE.md for architecture
- Check DEMO_QUICK_REFERENCE.md for quick answers
- Look at console for error messages

**Found a bug?**
- Document exact steps to reproduce
- Save browser console output
- Include screenshots
- Report with all details

---

**Ready to test?** 🚀 Start with `npm run dev` and follow the tests above!

