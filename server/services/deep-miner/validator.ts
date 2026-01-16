import { z } from 'zod';

export class CSRValidator {
  private static schema = z
    .object({
      regulatory: z.object({
        submission_id: z.string(),
        study_id: z.string(),
      }),
      protocol: z.object({
        design: z.object({
          phase: z.enum(['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Unknown']),
          is_adaptive: z.boolean(),
        }),
      }),
      population: z.object({
        enrollment: z.object({
          randomized_n: z.number().nonnegative(),
          completed_n: z.number().nonnegative(),
        }),
      }),
    })
    .passthrough();

  validate(data: any) {
    const result = CSRValidator.schema.safeParse(data);

    let fields = 0;
    let filled = 0;
    const count = (obj: any) => {
      if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(value => {
          fields++;
          if (value !== null && value !== undefined && value !== '') filled++;
          count(value);
        });
      }
    };
    count(data);

    return {
      isValid: result.success,
      score: fields > 0 ? filled / fields : 0,
      errors: result.success ? [] : result.error.errors,
    };
  }
}
