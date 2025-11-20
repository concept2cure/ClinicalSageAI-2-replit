type Num = number | undefined;

function ge(x: Num, min: Num) {
  return x === undefined || min === undefined ? true : x >= min;
}
function le(x: Num, max: Num) {
  return x === undefined || max === undefined ? true : x <= max;
}

export function evalSST(payload: any, rules: any) {
  const out: string[] = [];
  const okPlates = ge(payload.plates ?? payload.theoretical_plates, rules.plates_min);
  if (!okPlates) out.push(`plates ${payload.plates} < min ${rules.plates_min}`);
  const okTailing = le(payload.tailing, rules.tailing_max);
  if (!okTailing) out.push(`tailing ${payload.tailing} > max ${rules.tailing_max}`);
  const okR2 = ge(payload.r2 ?? payload.r_squared, rules.r2_min);
  if (!okR2) out.push(`r² ${payload.r2} < min ${rules.r2_min}`);
  const okRsd = le(payload.rsd ?? payload.rsd_percent, rules.rsd_max);
  if (!okRsd) out.push(`%RSD ${payload.rsd} > max ${rules.rsd_max}`);
  const okRes = ge(payload.resolution, rules.resolution_min);
  if (rules.resolution_min !== undefined && !okRes)
    out.push(`resolution ${payload.resolution} < min ${rules.resolution_min}`);
  const okSlopeMin = ge(payload.slope, rules.slope_min);
  const okSlopeMax = le(payload.slope, rules.slope_max);
  if (
    (rules.slope_min !== undefined && !okSlopeMin) ||
    (rules.slope_max !== undefined && !okSlopeMax)
  )
    out.push(`slope out of range`);
  const okTemp = rules.temp_range
    ? payload.temp >= rules.temp_range[0] && payload.temp <= rules.temp_range[1]
    : true;
  if (rules.temp_range && !okTemp)
    out.push(`temp ${payload.temp} not in [${rules.temp_range[0]},${rules.temp_range[1]}]`);
  const ok = out.length === 0;
  return { ok, reasons: out };
}

export function evalMicro(limits: any, results: any) {
  const msgs: string[] = [];
  function num(v: any) {
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }
  const tamcL = num(limits?.TAMC?.limit),
    tamcV = num(results?.TAMC);
  if (tamcL !== undefined && tamcV !== undefined && tamcV > tamcL)
    msgs.push(`TAMC ${tamcV} > limit ${tamcL} ${limits.TAMC.unit || ''}`);
  const tymcL = num(limits?.TYMC?.limit),
    tymcV = num(results?.TYMC);
  if (tymcL !== undefined && tymcV !== undefined && tymcV > tymcL)
    msgs.push(`TYMC ${tymcV} > limit ${tymcL} ${limits.TYMC.unit || ''}`);
  const spe = Array.isArray(limits?.specified_absence) ? limits.specified_absence : [];
  for (const s of spe) {
    const key = (s.org || '').toLowerCase();
    const present = String(results?.organisms || '')
      .toLowerCase()
      .includes(key);
    if (present) msgs.push(`Specified organism detected: ${s.org}`);
  }
  const endL = num(limits?.endotoxin?.limit),
    endV = num(results?.endotoxin);
  if (endL !== undefined && endV !== undefined && endV > endL)
    msgs.push(`Endotoxin ${endV} > limit ${endL} ${limits.endotoxin.unit || ''}`);
  return { pass: msgs.length === 0, reasons: msgs };
}
