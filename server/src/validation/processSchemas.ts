import { z } from 'zod';

export const StageBody = z.object({ stage: z.enum(['DESIGN', 'QUAL', 'VALIDATED']) });
export const PPQBody = z.object({
  lot_no: z.string().min(1),
  run_date: z.string().min(4),
  result: z.enum(['PASS', 'FAIL']),
  notes: z.string().optional(),
});
export const CSBody = z.object({
  paramName: z.string().min(1),
  test: z.string().min(1),
  limit: z.string().min(1),
  methodHint: z.string().optional(),
});
export const DSBody = z.object({
  factors: z.array(
    z.object({
      name: z.string().min(1),
      low: z.string(),
      high: z.string(),
      unit: z.string().optional(),
    })
  ),
  status: z.enum(['DRAFT', 'LOCKED']).optional(),
});
export const CPVRulesBody = z.object({
  param: z.string().min(1),
  rules: z.array(z.enum(['WE1', 'WE2', 'WE3', 'WE4'])),
});
