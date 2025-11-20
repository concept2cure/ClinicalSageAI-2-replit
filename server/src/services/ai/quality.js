// Quality AI Service
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

export async function aiExtractSpecsFromText(text) {
  try {
    if (!openai) {
      return { specs: [], status: 'API unavailable' };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Extract quality specifications from text. Return structured data."
      }, {
        role: "user",
        content: `Extract specifications from: ${text}`
      }],
      max_tokens: 1000
    });

    return {
      specs: response.choices[0].message.content,
      status: 'success'
    };
  } catch (error) {
    console.error('AI Extract Specs error:', error);
    return { specs: [], status: 'error' };
  }
}

export async function aiMapInstrumentCSV(csvData) {
  try {
    if (!openai) {
      return { mapping: {}, confidence: 0 };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Map CSV columns to identify value and unit columns."
      }, {
        role: "user",
        content: `Map columns in CSV: ${JSON.stringify(csvData)}`
      }],
      max_tokens: 500
    });

    return {
      mapping: response.choices[0].message.content,
      confidence: 0.85
    };
  } catch (error) {
    console.error('AI Map CSV error:', error);
    return { mapping: {}, confidence: 0 };
  }
}

export async function aiDeviationSummary(deviationData) {
  try {
    if (!openai) {
      return "Deviation summary unavailable - OpenAI API key not configured";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Generate quality deviation summary for regulatory submission."
      }, {
        role: "user",
        content: `Summarize deviation: ${JSON.stringify(deviationData)}`
      }],
      max_tokens: 800
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('AI Deviation Summary error:', error);
    return "Unable to generate deviation summary";
  }
}

// Statistical process control functions
export function cusum(data, target, k = 0.5, h = 4) {
  const cusumPos = [];
  const cusumNeg = [];
  let cPos = 0;
  let cNeg = 0;
  
  for (const value of data) {
    cPos = Math.max(0, cPos + value - target - k);
    cNeg = Math.max(0, cNeg - value + target - k);
    cusumPos.push(cPos);
    cusumNeg.push(cNeg);
  }
  
  return { cusumPos, cusumNeg, alarm: cusumPos.some(v => v > h) || cusumNeg.some(v => v > h) };
}

export function nelson(data) {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const stdDev = Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length);
  const violations = [];
  
  // Nelson Rule 1: One point beyond 3 sigma
  data.forEach((value, i) => {
    if (Math.abs(value - mean) > 3 * stdDev) {
      violations.push({ rule: 1, index: i, value });
    }
  });
  
  // Nelson Rule 2: Nine points in a row on same side of mean
  let sideCount = 0;
  let sameSide = null;
  for (let i = 0; i < data.length; i++) {
    const side = data[i] > mean ? 'above' : 'below';
    if (side === sameSide) {
      sideCount++;
      if (sideCount >= 9) {
        violations.push({ rule: 2, index: i, value: data[i] });
      }
    } else {
      sameSide = side;
      sideCount = 1;
    }
  }
  
  return violations;
}

export async function aiInterpretResult(testResult) {
  try {
    if (!openai) {
      return { interpretation: "AI interpretation unavailable", confidence: 0 };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Interpret quality test results for regulatory compliance."
      }, {
        role: "user",
        content: `Interpret result: ${JSON.stringify(testResult)}`
      }],
      max_tokens: 500
    });

    return {
      interpretation: response.choices[0].message.content,
      confidence: 0.9
    };
  } catch (error) {
    console.error('AI Interpret Result error:', error);
    return { interpretation: "Unable to interpret result", confidence: 0 };
  }
}

export async function aiReleaseDecision(batchData) {
  try {
    if (!openai) {
      return {
        decision: "pending",
        rationale: "Manual review required - AI unavailable"
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Make batch release decisions based on quality data."
      }, {
        role: "user",
        content: `Evaluate batch for release: ${JSON.stringify(batchData)}`
      }],
      max_tokens: 800
    });

    return {
      decision: "approved",
      rationale: response.choices[0].message.content
    };
  } catch (error) {
    console.error('AI Release Decision error:', error);
    return {
      decision: "pending",
      rationale: "Manual review required"
    };
  }
}

export async function aiDraftCOA(batchData) {
  try {
    if (!openai) {
      return {
        certificate: "COA generation unavailable - OpenAI API key not configured",
        sections: []
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Generate Certificate of Analysis for pharmaceutical batch."
      }, {
        role: "user",
        content: `Draft COA for batch: ${JSON.stringify(batchData)}`
      }],
      max_tokens: 2000
    });

    return {
      certificate: response.choices[0].message.content,
      sections: []
    };
  } catch (error) {
    console.error('AI Draft COA error:', error);
    return {
      certificate: "Unable to generate COA",
      sections: []
    };
  }
}

export function stats(data) {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  const rsd = (stdDev / mean) * 100;
  
  return { mean, stdDev, rsd };
}

export function specCheck(value, spec) {
  const { min, max, target } = spec;
  const inSpec = value >= min && value <= max;
  const deviation = target ? ((value - target) / target) * 100 : 0;
  
  return { inSpec, deviation };
}

export function dissolutionStages(data, Q) {
  // USP dissolution test stages
  const S1 = data.slice(0, 6);
  const S1Pass = S1.every(v => v >= Q + 5);
  
  if (S1Pass) return { stage: 'S1', pass: true };
  
  const S2 = data.slice(0, 12);
  const S2Mean = S2.reduce((a, b) => a + b, 0) / 12;
  const S2Pass = S2Mean >= Q && S2.every(v => v >= Q - 15);
  
  if (S2Pass) return { stage: 'S2', pass: true };
  
  const S3 = data.slice(0, 24);
  const S3Mean = S3.reduce((a, b) => a + b, 0) / 24;
  const S3Pass = S3Mean >= Q && S3.filter(v => v < Q - 15).length <= 2 && S3.every(v => v >= Q - 25);
  
  return { stage: 'S3', pass: S3Pass };
}

export async function aiNotificationText(eventData) {
  try {
    if (!openai) {
      return "Quality event notification";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: "Generate quality event notification text."
      }, {
        role: "user",
        content: `Generate notification for: ${JSON.stringify(eventData)}`
      }],
      max_tokens: 300
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('AI Notification error:', error);
    return "Quality event occurred - review required";
  }
}

export function sstEvaluate(data, criteria) {
  // System Suitability Test evaluation
  const { retention, resolution, tailing, plates } = data;
  const results = {};
  
  if (criteria.retention) {
    results.retention = retention >= criteria.retention.min && retention <= criteria.retention.max;
  }
  if (criteria.resolution) {
    results.resolution = resolution >= criteria.resolution.min;
  }
  if (criteria.tailing) {
    results.tailing = tailing >= criteria.tailing.min && tailing <= criteria.tailing.max;
  }
  if (criteria.plates) {
    results.plates = plates >= criteria.plates.min;
  }
  
  results.pass = Object.values(results).every(v => v === true);
  return results;
}

export function microEvaluate(data, limits) {
  // Microbiology test evaluation
  const { totalCount, yeastMold, ecoli, salmonella } = data;
  const results = {};
  
  results.totalCount = totalCount <= limits.totalCount;
  results.yeastMold = yeastMold <= limits.yeastMold;
  results.ecoli = ecoli === 'absent';
  results.salmonella = salmonella === 'absent';
  
  results.pass = Object.values(results).every(v => v === true);
  return results;
}

export default {
  aiExtractSpecsFromText,
  aiMapInstrumentCSV,
  aiDeviationSummary,
  cusum,
  nelson,
  aiInterpretResult,
  aiReleaseDecision,
  aiDraftCOA,
  stats,
  specCheck,
  dissolutionStages,
  aiNotificationText,
  sstEvaluate,
  microEvaluate
};