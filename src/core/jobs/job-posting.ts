import { z } from 'zod';

export const HttpUrlSchema = z
  .string()
  .max(2_000)
  .refine((input) => {
    try {
      const url = new URL(input);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Invalid HTTP(S) URL');

const optionalText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();

export const JobPostingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.literal('seek-nz'),
  externalId: optionalText(200),
  canonicalUrl: HttpUrlSchema,
  applicationUrl: HttpUrlSchema.nullable(),
  title: z.string().trim().min(1).max(500),
  company: optionalText(500),
  location: optionalText(500),
  employmentType: optionalText(200),
  salaryText: optionalText(500),
  description: z.string().trim().min(1).max(200_000),
  postedAt: z.iso.date().nullable(),
  postedAtText: optionalText(200),
  closesAt: z.iso.date().nullable(),
  closesAtText: optionalText(200),
  extractedAt: z.iso.datetime(),
  extractionWarnings: z
    .array(z.string().trim().min(1).max(500))
    .max(50)
    .refine((warnings) => new Set(warnings).size === warnings.length),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
