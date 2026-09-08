export type RuleType =
  | 'exclude-keyword'
  | 'exclude-company'
  | 'max-distance';

export type RuleField =
  | 'title'
  | 'company'
  | 'location'
  | 'summary'
  | 'all';

export interface BaseRule {
  id: string;
  type: RuleType;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KeywordRule extends BaseRule {
  type: 'exclude-keyword';
  pattern: string;
  matchMode: 'contains' | 'phrase' | 'prefix-wildcard';
  fields: RuleField[];
}

export interface CompanyRule extends BaseRule {
  type: 'exclude-company';
  pattern: string;
  matchMode: 'contains' | 'exact';
}

export interface DistanceRule extends BaseRule {
  type: 'max-distance';
  maximumKm: number;
}

export type FilterRule =
  | KeywordRule
  | CompanyRule
  | DistanceRule;

export interface FilterProfile {
  id: string;
  name: string;
  ruleIds: string[];
  activeOriginId: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LocalFilterSettings {
  schemaVersion: 2;
  configurationRevision: number;
  rules: FilterRule[];
  profiles: FilterProfile[];
  activeProfileId: string;
}

export type LocationConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface DistanceMetadata {
  centreDistanceKm: number;
  conservativeDistanceKm: number;
  confidence: LocationConfidence;
  originUncertaintyKm: number;
  destinationUncertaintyKm: number;
}

export interface RuleMatch {
  ruleId: string;
  ruleType: RuleType | 'dismissed';
  label: string;
  matchedField?: RuleField;
  matchedText?: string;
}

export interface EvaluationResult {
  visible: boolean;
  reasons: RuleMatch[];
  distance?: DistanceMetadata;
  distanceUnavailable?: boolean;
}
