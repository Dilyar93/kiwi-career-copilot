# Chrome Web Store privacy-practices answers

These answers document the Developer Dashboard disclosure for the published V1
`0.8.0` extension and remain consistent with the deployed
[privacy notice](https://dilyar93.github.io/kiwi-job-search-enhancer-site/privacy.html).
They apply only to V1 and must not be used for an unreleased V2 submission.

## Single purpose

Enhance supported New Zealand job-search result pages with user-controlled,
local-first filtering and job-status tools.

## Permission justifications

- `sidePanel`: Displays the extension’s Overview, filters, dismissed jobs,
  commute controls and settings without replacing or navigating away from the
  job-search page.
- `storage`: Stores language/display preferences, local filter rules, adapter
  health counts and the user-selected commute origin. Job seen/dismissed state
  is stored locally in extension IndexedDB.
- `geolocation`: Used only after the user selects “Use my current location” to
  create a rounded local commute origin. Chrome does not permit this permission
  to be optional. The extension does not watch or upload location.
- `https://nz.seek.com/*` and `https://www.seek.co.nz/*`: Reads and decorates
  job cards already displayed on SEEK New Zealand result pages so the
  user-facing filters can run.

## Remote code

Select **No, I am not using remote code**. All executable code is packaged in
the extension. The bundled LINZ-derived location file is static data, not code.

## User-data disclosures

Disclose the following handled data:

- **Website content:** visible job title, company, location, category, summary
  and job link from supported result cards.
- **Location:** a location selected by the user, or coordinates returned after
  the user explicitly invokes browser geolocation.
- **User activity:** local Seen and Not interested choices for job cards.

The extension does not build or retain general browsing history, access account
credentials, collect financial or health data, or transmit handled data to the
developer or third parties. Language and ordinary display preferences may use
browser sync; rules, job history and commute coordinates do not.

## Limited-use certifications

Certify that handled data is used only to provide the disclosed single purpose,
is not sold, is not used for advertising or credit decisions, is not transferred
to unrelated third parties and is not read by humans. The public privacy policy
contains the Chrome Web Store Limited Use statement.

## Publisher fields

For maintenance of the published V1 listing, keep the Developer Dashboard
contact email monitored and its privacy and support URLs pointed to the deployed
[V1 public site](https://dilyar93.github.io/kiwi-job-search-enhancer-site/).
These fields are not a V2 submission checklist.
