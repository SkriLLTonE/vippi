import { z } from 'zod';

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, { message: 'invalid_time' });

export const SlaPolicySchema = z
  .object({
    firstResponseMinutes: z.number().int().min(1, { message: 'out_of_range' }).max(1440, { message: 'out_of_range' }),
    forgottenAfterHours: z.number().int().min(1, { message: 'out_of_range' }).max(168, { message: 'out_of_range' }),
    businessHoursEnabled: z.boolean(),
    workdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, { message: 'workdays_required' })
      .max(7)
      .refine((a) => new Set(a).size === a.length, { message: 'workdays_unique' }),
    workStart: timeSchema,
    workEnd: timeSchema,
  })
  .strict()
  .refine((v) => v.workStart < v.workEnd, { path: ['workEnd'], message: 'start_before_end' });
export type SlaPolicyRequest = z.infer<typeof SlaPolicySchema>;

export interface SlaPolicyDto extends SlaPolicyRequest {
  updatedAt: string;
}

export interface SlaPolicyLike {
  firstResponseMinutes: number;
  businessHoursEnabled: boolean;
  workdays: number[];
  workStart: string;
  workEnd: string;
}
