import type { NormalizedJob } from '../jobs/job-types';
import { normalizeText } from '../text/normalize-text';
import { matchesPrefixWildcard } from '../text/wildcard-matcher';
import type {
  CompanyRule,
  DistanceMetadata,
  EvaluationResult,
  FilterRule,
  KeywordRule,
  RuleField,
  RuleMatch,
} from './rule-types';

export interface EvaluationContext {
  rules: FilterRule[];
  jobState?: { status: 'seen' | 'dismissed' } | null;
  distance?: DistanceMetadata & { distanceEligible: boolean };
}

type FieldValue = [RuleField, string | null, string | null];

function isPlainPatternValid(pattern: string): boolean {
  const normalized = normalizeText(pattern);
  return (
    pattern.length <= 200 &&
    !pattern.includes('*') &&
    normalized.length > 0
  );
}

function compare(
  value: string,
  pattern: string,
  mode: 'contains' | 'exact',
): boolean {
  return mode === 'exact' ? value === pattern : value.includes(pattern);
}

function companyMatch(
  job: NormalizedJob,
  rule: CompanyRule,
): RuleMatch | null {
  if (!job.normalizedCompany || !isPlainPatternValid(rule.pattern)) return null;
  const pattern = normalizeText(rule.pattern);
  if (!compare(job.normalizedCompany, pattern, rule.matchMode)) return null;
  return {
    ruleId: rule.id,
    ruleType: rule.type,
    label: rule.pattern,
    matchedField: 'company',
    matchedText: job.company ?? undefined,
  };
}

function keywordFields(job: NormalizedJob, fields: RuleField[]): FieldValue[] {
  const values: FieldValue[] = [
    ['title', job.normalizedTitle, job.title],
    ['company', job.normalizedCompany, job.company],
    ['location', job.normalizedLocationText, job.locationText],
    ['summary', job.normalizedSummaryText, job.summaryText],
  ];
  if (fields.includes('all')) return values;
  return values.filter(([field]) => fields.includes(field));
}

function keywordValueMatches(value: string, rule: KeywordRule): boolean {
  if (rule.matchMode === 'prefix-wildcard') {
    return matchesPrefixWildcard(value, rule.pattern);
  }
  if (!isPlainPatternValid(rule.pattern)) return false;

  const pattern = normalizeText(rule.pattern);
  if (rule.matchMode === 'contains') {
    return !pattern.includes(' ') && value.split(' ').includes(pattern);
  }
  return ` ${value} `.includes(` ${pattern} `);
}

function keywordMatch(
  job: NormalizedJob,
  rule: KeywordRule,
): RuleMatch | null {
  for (const [field, value, original] of keywordFields(job, rule.fields)) {
    if (value && keywordValueMatches(value, rule)) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        label: rule.pattern,
        matchedField: field,
        matchedText: original ?? undefined,
      };
    }
  }
  return null;
}

export function evaluateJob(
  job: NormalizedJob,
  context: EvaluationContext,
): EvaluationResult {
  const reasons: RuleMatch[] = [];
  const enabled = context.rules.filter((rule) => rule.enabled);

  if (context.jobState?.status === 'dismissed') {
    reasons.push({
      ruleId: 'dismissed',
      ruleType: 'dismissed',
      label: 'dismissed',
    });
  }

  for (const rule of enabled) {
    if (rule.type === 'exclude-company') {
      const match = companyMatch(job, rule);
      if (match) reasons.push(match);
    }
  }
  for (const rule of enabled) {
    if (rule.type === 'exclude-keyword') {
      const match = keywordMatch(job, rule);
      if (match) reasons.push(match);
    }
  }
  if (context.distance?.distanceEligible) {
    for (const rule of enabled) {
      if (
        rule.type === 'max-distance' &&
        Number.isFinite(rule.maximumKm) &&
        rule.maximumKm > 0 &&
        context.distance.conservativeDistanceKm > rule.maximumKm
      ) {
        reasons.push({
          ruleId: rule.id,
          ruleType: rule.type,
          label: `${context.distance.centreDistanceKm} km`,
        });
      }
    }
  }

  return {
    visible: reasons.length === 0,
    reasons,
    ...(context.distance && {
      distance: {
        centreDistanceKm: context.distance.centreDistanceKm,
        conservativeDistanceKm: context.distance.conservativeDistanceKm,
        confidence: context.distance.confidence,
        originUncertaintyKm: context.distance.originUncertaintyKm,
        destinationUncertaintyKm: context.distance.destinationUncertaintyKm,
      },
    }),
  };
}
