/** Normalised player stats from any cricket scorecard source */
export interface CricketPlayerStats {
  played: boolean;
  batted: boolean;
  pureBowler: boolean;
  // Batting
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  duck?: boolean;
  // Bowling
  wickets: number;
  lbwBowled: number;
  maidens: number;
  ballsBowled: number;
  runsConceded: number;
  dotBalls: number;
  // Fielding
  catches: number;
  stumpings: number;
  runOutDirect: number;
  runOutIndirect: number;
  // Bowling sub-role flag set from roster
  isBowler: boolean;
}

export interface ScoringResult {
  playerName: string;
  stats: CricketPlayerStats;
  basePoints: number;
  /** Points after captain/VC multiplier */
  effectivePoints: number;
  captainRole: 'CAPTAIN' | 'VICE_CAPTAIN' | null;
}

/** Raw CricAPI batting row */
export interface CricApiBattingRow {
  batsman?: { name?: string };
  r?: string | number;
  b?: string | number;
  '4s'?: string | number;
  '6s'?: string | number;
  dismissal?: string;
  'dismissal-text'?: string;
  catcher?: { name?: string };
  bowler?: { name?: string };
}

/** Raw CricAPI bowling row */
export interface CricApiBowlingRow {
  bowler?: { name?: string };
  o?: string | number;
  m?: string | number;
  r?: string | number;
  w?: string | number;
  nb?: string | number;
  wd?: string | number;
}

/** Raw CricAPI catching row */
export interface CricApiCatchingRow {
  catcher?: { name?: string };
  catch?: string | number;
  stumped?: string | number;
  runout?: string | number;
  lbw?: string | number;
  bowled?: string | number;
}

export interface CricApiInning {
  batting?: CricApiBattingRow[];
  bowling?: CricApiBowlingRow[];
  catching?: CricApiCatchingRow[];
}

export interface CricApiScorecard {
  scorecard?: CricApiInning[];
}
