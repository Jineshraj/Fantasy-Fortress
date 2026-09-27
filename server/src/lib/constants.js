/**
 * Centralized similarity thresholds for player/club matching across services.
 *
 * Keep magic numbers in one place so tuning is a single-file change.
 * If importing this from a module would create a circular dependency,
 * inline the constant at the call site with a comment pointing here.
 */
export const SIMILARITY_THRESHOLDS = {
  // rosterValidator.js / fixtureService.js: name → master squad match
  ROSTER_MATCH: 0.50,
  // stadiumService.js: home-club fuzzy match against fixture home team
  STADIUM_CLUB: 0.85,
  // sofaScoreSyncService.js: SofaScore player → TM registry strict match
  SOFA_NAME: 0.82,
  SOFA_CLUB: 0.60,
  // apiFootballSyncService.js: API-Football player → TM registry strict match
  AF_NAME: 0.85,
  AF_CLUB: 0.70,
  // scoringEngine.js: dashboard-fuzzy lookup of player in stats map
  DASHBOARD_FUZZY: 0.75,
}