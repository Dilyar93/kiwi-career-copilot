export const SEEK_SELECTORS = {
  listRoots: [
    '[data-automation="searchResults"]',
    '[data-testid="search-results"]',
  ],
  cards: [
    'article[data-automation="normalJob"]',
    'article[data-testid="job-card"]',
    'article[data-card-type="JobCard"]',
  ],
  titles: [
    'a[data-automation="jobTitle"]',
    '[data-testid="job-card-title"]',
    'h3 a[href*="/job/"]',
  ],
  companies: [
    '[data-automation="jobCompany"]',
    '[data-testid="advertiser-name"]',
    '[data-automation="job-card-company"]',
  ],
  locations: [
    '[data-automation="jobLocation"]',
    '[data-testid="job-card-location"]',
    '[data-automation="job-card-location"]',
  ],
  summaries: [
    '[data-automation="jobShortDescription"]',
    '[data-testid="job-card-summary"]',
    '[data-automation="job-card-summary"]',
    '[data-automation="job-card-highlights"]',
  ],
  noResults: [
    '[data-automation="noSearchResults"]',
    '[data-testid="no-results"]',
  ],
  detail: {
    roots: ['[data-automation="jobDetailsPage"]'],
    titles: ['[data-automation="job-detail-title"]'],
    companies: ['[data-automation="advertiser-name"]'],
    locations: ['[data-automation="job-detail-location"]'],
    employmentTypes: ['[data-automation="job-detail-work-type"]'],
    salaries: ['[data-automation="job-detail-salary"]'],
    descriptions: ['[data-automation="jobAdDetails"]'],
    applyLinks: ['a[data-automation="job-detail-apply"]'],
  },
} as const;

export const SEEK_CARD_SELECTOR = SEEK_SELECTORS.cards.join(',');
