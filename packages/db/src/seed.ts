/**
 * Seed script — IPL 2026 player pool
 * Source: aahirDev/ipl-fantasy-2026/public/config/players.json
 *
 * Run: pnpm --filter @fantasy/db seed
 */

import 'dotenv/config';
import { getDb } from './client.js';
import { players } from './schema/index.js';
import { sql } from 'drizzle-orm';

// ── Role mapping: players.json → DB enum ─────────────────────────────────────
type DbRole = 'WK' | 'BAT' | 'AR' | 'BOWL';
const ROLE_MAP: Record<string, DbRole> = {
  'WK-BAT': 'WK',
  'BAT':    'BAT',
  'ALL':    'AR',
  'BOWL':   'BOWL',
};

// ── Overseas players ──────────────────────────────────────────────────────────
const OVERSEAS = new Set([
  // CSK
  'Dewald Brevis', 'Jamie Overton', 'Matthew Short', 'Zak Foulkes', 'Matt Henry',
  'Noor Ahmad', 'Akeal Hosein', 'Spencer Johnson',
  // DC
  'Pathum Nissanka', 'Tristan Stubbs', 'Dushmantha Chameera', 'Auqib Nabi',
  'Lungisani Ngidi', 'Kyle Jamieson', 'Mitchell Starc',
  // GT
  'Jos Buttler', 'Glenn Phillips', 'Tom Banton', 'Jason Holder', 'Luke Wood',
  'Rashid Khan', 'Kagiso Rabada',
  // KKR
  'Finn Allen', 'Tim Seifert', 'Rovman Powell', 'Cameron Green', 'Sunil Narine',
  'Blessing Muzarabani', 'Matheesha Pathirana',
  // LSG
  'Aiden Markram', 'Matthew Breetzke', 'Nicholas Pooran', 'Mitchell Marsh',
  'Wanindu Hasaranga', 'Anrich Nortje',
  // MI
  'Ryan Rickleton', 'Quinton de Kock', 'Will Jacks', 'Mitchell Santner',
  'Trent Boult', 'Allah Ghazanfar', 'Sherfane Rutherford',
  // PBKS
  'Marcus Stoinis', 'Marco Jansen', 'Azmatullah Omarzai', 'Cooper Connolly',
  'Xavier Bartlett', 'Lockie Ferguson',
  // RR
  'Donovan Ferreira', 'Shimron Hetmyer', 'Jofra Archer',
  // RCB
  'Phil Salt', 'Romario Shepherd', 'Jacob Bethell', 'Josh Hazlewood', 'Jacob Duffy',
  'Tim David',
  // SRH
  'Travis Head', 'Heinrich Klaasen', 'Liam Livingstone', 'Pat Cummins', 'Eshan Malinga',
]);

// ── Uncapped Indian players ───────────────────────────────────────────────────
const UNCAPPED = new Set([
  'Vaibhav Suryavanshi', 'Ayush Mhatre', 'Kartik Sharma', 'Urvil Patel',
  'Ramakrishna Ghosh', 'Prashant Veer', 'Aman Khan', 'Zak Foulkes', 'Gurjapneet Singh',
  'Sahil Parakh', 'Abhishek Porel', 'Vipraj Nigam', 'Ajay Mandal', 'Tripurana Vijay',
  'Madhav Tiwari', 'Prince Yadav', 'Kumar Kushagra', 'Anuj Rawat', 'Nishant Sindhu',
  'Manav Suthar', 'Gurnoor Singh Brar', 'Ashok Sharma', 'Angkrish Raghuvanshi',
  'Vaibhav Arora', 'Kartik Tyagi', 'Himmat Singh', 'Abdul Samad', 'Shahbaz Ahmed',
  'Digvesh Singh', 'Manimaran Siddharth', 'Arjun Tendulkar', 'Pyla Avinash',
  'Priyansh Arya', 'Vignesh Puthur', 'Shubham Dubey', 'Rasikh Dar', 'Abhinandan Singh',
  'Suyash Sharma', 'Jacob Duffy', 'Aniket Verma', 'Smaran Ravichandran',
  'Nitish Kumar Reddy', 'Zeeshan Ansari', 'Harsh Dubey', 'Shivang Kumar',
]);

// ── Pool & base price tiers ───────────────────────────────────────────────────
type Pool = 'A' | 'B' | 'C' | 'D';

const POOL_A = new Set([
  // Batters
  'Virat Kohli', 'Rohit Sharma', 'Yashasvi Jaiswal', 'Shubman Gill', 'Travis Head',
  'Jos Buttler', 'KL Rahul', 'Rishabh Pant', 'Ruturaj Gaikwad', 'Ishan Kishan',
  'Suryakumar Yadav', 'Finn Allen', 'Ryan Rickleton',
  // Bowlers
  'Jasprit Bumrah', 'Kagiso Rabada', 'Rashid Khan', 'Pat Cummins', 'Jofra Archer',
  'Mohammed Shami', 'Kuldeep Yadav', 'Trent Boult', 'Mitchell Starc', 'Arshdeep Singh',
  // All-rounders
  'Hardik Pandya', 'Sunil Narine', 'Ravindra Jadeja', 'Axar Patel', 'Cameron Green',
]);

const POOL_B = new Set([
  // Batters
  'MS Dhoni', 'Sanju Samson', 'Heinrich Klaasen', 'Quinton de Kock', 'Nicholas Pooran',
  'Shimron Hetmyer', 'Tilak Varma', 'Shreyas Iyer', 'Rajat Patidar', 'Abhishek Sharma',
  'Devdutt Padikkal', 'Rinku Singh', 'Sai Sudharsan', 'Riyan Parag', 'Dhruv Jurel',
  'Phil Salt', 'Tim David', 'Mitchell Marsh', 'Marcus Stoinis',
  // Bowlers
  'Wanindu Hasaranga', 'Matheesha Pathirana', 'Yuzvendra Chahal', 'Ravi Bishnoi',
  'Harshal Patel', 'Bhuvneshwar Kumar', 'T Natarajan', 'Deepak Chahar',
  'Liam Livingstone', 'Josh Hazlewood', 'Lockie Ferguson', 'Anrich Nortje',
  'Kyle Jamieson', 'Jacob Bethell', 'Marco Jansen', 'Blessing Muzarabani',
  // All-rounders
  'Washington Sundar', 'Krunal Pandya', 'Venkatesh Iyer', 'Shivam Dube',
  'Nitish Kumar Reddy', 'Aiden Markram',
]);

const POOL_C = new Set([
  'Vaibhav Suryavanshi', 'Prithvi Shaw', 'Karun Nair', 'David Miller', 'Pathum Nissanka',
  'Tristan Stubbs', 'Ajinkya Rahane', 'Manish Pandey', 'Rahul Tripathi', 'Glenn Phillips',
  'Rovman Powell', 'Nehal Wadhera', 'Prabhsimran Singh', 'Shashank Singh',
  'Matthew Breetzke', 'Himmat Singh', 'Donovan Ferreira', 'Noor Ahmad', 'Akeal Hosein',
  'Dushmantha Chameera', 'Lungisani Ngidi', 'Auqib Nabi', 'Allah Ghazanfar',
  'Azmatullah Omarzai', 'Cooper Connolly', 'Xavier Bartlett', 'Sherfane Rutherford',
  'Will Jacks', 'Mitchell Santner', 'Romario Shepherd', 'Jacob Duffy',
  'Nishant Sindhu', 'Jason Holder', 'Tom Banton', 'Luke Wood',
  'Sandeep Sharma', 'Jaydev Unadkat', 'Ramandeep Singh', 'Anukul Roy',
  'Rahul Chahar', 'Shreyas Gopal', 'Avesh Khan', 'Mohsin Khan', 'Mayank Yadav',
  'Khaleel Ahmed', 'Mukesh Kumar', 'Prasidh Krishna', 'Mohammed Siraj',
  'Spencer Johnson', 'Matt Henry', 'Mukesh Choudhary', 'Varun Chakaravarthy',
  'Vaibhav Arora', 'Navdeep Saini',
]);

function getPool(name: string): Pool {
  if (POOL_A.has(name)) return 'A';
  if (POOL_B.has(name)) return 'B';
  if (POOL_C.has(name)) return 'C';
  return 'D';
}

function getBasePrice(pool: Pool): number {
  return { A: 50, B: 30, C: 20, D: 10 }[pool];
}

// ── Player data ───────────────────────────────────────────────────────────────

interface RawPlayer { name: string; role: string; ipl: string }

const RAW_PLAYERS: RawPlayer[] = [
  // CSK
  { name: 'Ruturaj Gaikwad',    role: 'BAT',    ipl: 'CSK' },
  { name: 'MS Dhoni',           role: 'WK-BAT', ipl: 'CSK' },
  { name: 'Sanju Samson',       role: 'WK-BAT', ipl: 'CSK' },
  { name: 'Dewald Brevis',      role: 'BAT',    ipl: 'CSK' },
  { name: 'Ayush Mhatre',       role: 'BAT',    ipl: 'CSK' },
  { name: 'Kartik Sharma',      role: 'BAT',    ipl: 'CSK' },
  { name: 'Sarfaraz Khan',      role: 'BAT',    ipl: 'CSK' },
  { name: 'Urvil Patel',        role: 'WK-BAT', ipl: 'CSK' },
  { name: 'Jamie Overton',      role: 'ALL',    ipl: 'CSK' },
  { name: 'Ramakrishna Ghosh',  role: 'ALL',    ipl: 'CSK' },
  { name: 'Prashant Veer',      role: 'ALL',    ipl: 'CSK' },
  { name: 'Matthew Short',      role: 'ALL',    ipl: 'CSK' },
  { name: 'Aman Khan',          role: 'ALL',    ipl: 'CSK' },
  { name: 'Zak Foulkes',        role: 'ALL',    ipl: 'CSK' },
  { name: 'Shivam Dube',        role: 'ALL',    ipl: 'CSK' },
  { name: 'Khaleel Ahmed',      role: 'BOWL',   ipl: 'CSK' },
  { name: 'Noor Ahmad',         role: 'BOWL',   ipl: 'CSK' },
  { name: 'Anshul Kamboj',      role: 'BOWL',   ipl: 'CSK' },
  { name: 'Mukesh Choudhary',   role: 'BOWL',   ipl: 'CSK' },
  { name: 'Shreyas Gopal',      role: 'BOWL',   ipl: 'CSK' },
  { name: 'Gurjapneet Singh',   role: 'BOWL',   ipl: 'CSK' },
  { name: 'Akeal Hosein',       role: 'BOWL',   ipl: 'CSK' },
  { name: 'Matt Henry',         role: 'BOWL',   ipl: 'CSK' },
  { name: 'Rahul Chahar',       role: 'BOWL',   ipl: 'CSK' },
  { name: 'Spencer Johnson',    role: 'BOWL',   ipl: 'CSK' },
  { name: 'Shardul Thakur',     role: 'ALL',    ipl: 'CSK' },
  // DC
  { name: 'KL Rahul',           role: 'WK-BAT', ipl: 'DC' },
  { name: 'Karun Nair',         role: 'BAT',    ipl: 'DC' },
  { name: 'David Miller',       role: 'BAT',    ipl: 'DC' },
  { name: 'Pathum Nissanka',    role: 'BAT',    ipl: 'DC' },
  { name: 'Sahil Parakh',       role: 'BAT',    ipl: 'DC' },
  { name: 'Prithvi Shaw',       role: 'BAT',    ipl: 'DC' },
  { name: 'Abhishek Porel',     role: 'WK-BAT', ipl: 'DC' },
  { name: 'Tristan Stubbs',     role: 'BAT',    ipl: 'DC' },
  { name: 'Axar Patel',         role: 'ALL',    ipl: 'DC' },
  { name: 'Sameer Rizvi',       role: 'ALL',    ipl: 'DC' },
  { name: 'Ashutosh Sharma',    role: 'ALL',    ipl: 'DC' },
  { name: 'Vipraj Nigam',       role: 'BOWL',   ipl: 'DC' },
  { name: 'Ajay Mandal',        role: 'ALL',    ipl: 'DC' },
  { name: 'Tripurana Vijay',    role: 'ALL',    ipl: 'DC' },
  { name: 'Madhav Tiwari',      role: 'ALL',    ipl: 'DC' },
  { name: 'Nitish Rana',        role: 'BAT',    ipl: 'DC' },
  { name: 'Mitchell Starc',     role: 'BOWL',   ipl: 'DC' },
  { name: 'T Natarajan',        role: 'BOWL',   ipl: 'DC' },
  { name: 'Mukesh Kumar',       role: 'BOWL',   ipl: 'DC' },
  { name: 'Dushmantha Chameera',role: 'BOWL',   ipl: 'DC' },
  { name: 'Auqib Nabi',         role: 'BOWL',   ipl: 'DC' },
  { name: 'Lungisani Ngidi',    role: 'BOWL',   ipl: 'DC' },
  { name: 'Kyle Jamieson',      role: 'BOWL',   ipl: 'DC' },
  { name: 'Kuldeep Yadav',      role: 'BOWL',   ipl: 'DC' },
  // GT
  { name: 'Shubman Gill',       role: 'BAT',    ipl: 'GT' },
  { name: 'Jos Buttler',        role: 'WK-BAT', ipl: 'GT' },
  { name: 'Kumar Kushagra',     role: 'WK-BAT', ipl: 'GT' },
  { name: 'Anuj Rawat',         role: 'WK-BAT', ipl: 'GT' },
  { name: 'Tom Banton',         role: 'BAT',    ipl: 'GT' },
  { name: 'Glenn Phillips',     role: 'BAT',    ipl: 'GT' },
  { name: 'Sai Sudharsan',      role: 'BAT',    ipl: 'GT' },
  { name: 'Nishant Sindhu',     role: 'ALL',    ipl: 'GT' },
  { name: 'Washington Sundar',  role: 'ALL',    ipl: 'GT' },
  { name: 'Sai Kishore',        role: 'BOWL',   ipl: 'GT' },
  { name: 'Jayant Yadav',       role: 'ALL',    ipl: 'GT' },
  { name: 'Jason Holder',       role: 'ALL',    ipl: 'GT' },
  { name: 'Rahul Tewatia',      role: 'ALL',    ipl: 'GT' },
  { name: 'Shahrukh Khan',      role: 'BAT',    ipl: 'GT' },
  { name: 'Kagiso Rabada',      role: 'BOWL',   ipl: 'GT' },
  { name: 'Mohammed Siraj',     role: 'BOWL',   ipl: 'GT' },
  { name: 'Prasidh Krishna',    role: 'BOWL',   ipl: 'GT' },
  { name: 'Manav Suthar',       role: 'BOWL',   ipl: 'GT' },
  { name: 'Gurnoor Singh Brar', role: 'BOWL',   ipl: 'GT' },
  { name: 'Ishant Sharma',      role: 'BOWL',   ipl: 'GT' },
  { name: 'Ashok Sharma',       role: 'BOWL',   ipl: 'GT' },
  { name: 'Luke Wood',          role: 'BOWL',   ipl: 'GT' },
  { name: 'Rashid Khan',        role: 'BOWL',   ipl: 'GT' },
  // KKR
  { name: 'Ajinkya Rahane',         role: 'BAT',    ipl: 'KKR' },
  { name: 'Rinku Singh',            role: 'BAT',    ipl: 'KKR' },
  { name: 'Angkrish Raghuvanshi',   role: 'BAT',    ipl: 'KKR' },
  { name: 'Manish Pandey',          role: 'BAT',    ipl: 'KKR' },
  { name: 'Finn Allen',             role: 'WK-BAT', ipl: 'KKR' },
  { name: 'Rahul Tripathi',         role: 'BAT',    ipl: 'KKR' },
  { name: 'Tim Seifert',            role: 'WK-BAT', ipl: 'KKR' },
  { name: 'Rovman Powell',          role: 'BAT',    ipl: 'KKR' },
  { name: 'Anukul Roy',             role: 'ALL',    ipl: 'KKR' },
  { name: 'Cameron Green',          role: 'ALL',    ipl: 'KKR' },
  { name: 'Ramandeep Singh',        role: 'BAT',    ipl: 'KKR' },
  { name: 'Sunil Narine',           role: 'ALL',    ipl: 'KKR' },
  { name: 'Blessing Muzarabani',    role: 'BOWL',   ipl: 'KKR' },
  { name: 'Vaibhav Arora',          role: 'BOWL',   ipl: 'KKR' },
  { name: 'Matheesha Pathirana',    role: 'BOWL',   ipl: 'KKR' },
  { name: 'Varun Chakaravarthy',    role: 'BOWL',   ipl: 'KKR' },
  { name: 'Kartik Tyagi',           role: 'BOWL',   ipl: 'KKR' },
  { name: 'Navdeep Saini',          role: 'BOWL',   ipl: 'KKR' },
  // LSG
  { name: 'Prince Yadav',       role: 'BOWL',   ipl: 'LSG' },
  { name: 'Rishabh Pant',       role: 'WK-BAT', ipl: 'LSG' },
  { name: 'Aiden Markram',      role: 'ALL',    ipl: 'LSG' },
  { name: 'Himmat Singh',       role: 'BAT',    ipl: 'LSG' },
  { name: 'Matthew Breetzke',   role: 'BAT',    ipl: 'LSG' },
  { name: 'Nicholas Pooran',    role: 'WK-BAT', ipl: 'LSG' },
  { name: 'Mitchell Marsh',     role: 'ALL',    ipl: 'LSG' },
  { name: 'Abdul Samad',        role: 'ALL',    ipl: 'LSG' },
  { name: 'Shahbaz Ahmed',      role: 'ALL',    ipl: 'LSG' },
  { name: 'Wanindu Hasaranga',  role: 'BOWL',   ipl: 'LSG' },
  { name: 'Ayush Badoni',       role: 'BAT',    ipl: 'LSG' },
  { name: 'Mohammed Shami',     role: 'BOWL',   ipl: 'LSG' },
  { name: 'Avesh Khan',         role: 'BOWL',   ipl: 'LSG' },
  { name: 'Digvesh Singh',      role: 'BOWL',   ipl: 'LSG' },
  { name: 'Manimaran Siddharth',role: 'BOWL',   ipl: 'LSG' },
  { name: 'Mayank Yadav',       role: 'BOWL',   ipl: 'LSG' },
  { name: 'Mohsin Khan',        role: 'BOWL',   ipl: 'LSG' },
  { name: 'Arjun Tendulkar',    role: 'BOWL',   ipl: 'LSG' },
  { name: 'Anrich Nortje',      role: 'BOWL',   ipl: 'LSG' },
  // MI
  { name: 'Rohit Sharma',       role: 'BAT',    ipl: 'MI' },
  { name: 'Suryakumar Yadav',   role: 'BAT',    ipl: 'MI' },
  { name: 'Ryan Rickleton',     role: 'WK-BAT', ipl: 'MI' },
  { name: 'Quinton de Kock',    role: 'WK-BAT', ipl: 'MI' },
  { name: 'Tilak Varma',        role: 'BAT',    ipl: 'MI' },
  { name: 'Hardik Pandya',      role: 'ALL',    ipl: 'MI' },
  { name: 'Will Jacks',         role: 'ALL',    ipl: 'MI' },
  { name: 'Mitchell Santner',   role: 'ALL',    ipl: 'MI' },
  { name: 'Deepak Chahar',      role: 'BOWL',   ipl: 'MI' },
  { name: 'Jasprit Bumrah',     role: 'BOWL',   ipl: 'MI' },
  { name: 'Trent Boult',        role: 'BOWL',   ipl: 'MI' },
  { name: 'Allah Ghazanfar',    role: 'BOWL',   ipl: 'MI' },
  { name: 'Sherfane Rutherford',role: 'BAT',    ipl: 'MI' },
  // PBKS
  { name: 'Shreyas Iyer',       role: 'BAT',    ipl: 'PBKS' },
  { name: 'Nehal Wadhera',      role: 'BAT',    ipl: 'PBKS' },
  { name: 'Prabhsimran Singh',  role: 'WK-BAT', ipl: 'PBKS' },
  { name: 'Shashank Singh',     role: 'BAT',    ipl: 'PBKS' },
  { name: 'Pyla Avinash',       role: 'ALL',    ipl: 'PBKS' },
  { name: 'Priyansh Arya',      role: 'BAT',    ipl: 'PBKS' },
  { name: 'Marcus Stoinis',     role: 'ALL',    ipl: 'PBKS' },
  { name: 'Marco Jansen',       role: 'ALL',    ipl: 'PBKS' },
  { name: 'Azmatullah Omarzai', role: 'ALL',    ipl: 'PBKS' },
  { name: 'Cooper Connolly',    role: 'ALL',    ipl: 'PBKS' },
  { name: 'Arshdeep Singh',     role: 'BOWL',   ipl: 'PBKS' },
  { name: 'Yuzvendra Chahal',   role: 'BOWL',   ipl: 'PBKS' },
  { name: 'Vyshak Vijaykumar',  role: 'BOWL',   ipl: 'PBKS' },
  { name: 'Xavier Bartlett',    role: 'BOWL',   ipl: 'PBKS' },
  { name: 'Lockie Ferguson',    role: 'BOWL',   ipl: 'PBKS' },
  // RR
  { name: 'Yashasvi Jaiswal',       role: 'BAT',    ipl: 'RR' },
  { name: 'Vaibhav Suryavanshi',    role: 'BAT',    ipl: 'RR' },
  { name: 'Donovan Ferreira',       role: 'WK-BAT', ipl: 'RR' },
  { name: 'Shimron Hetmyer',        role: 'BAT',    ipl: 'RR' },
  { name: 'Dhruv Jurel',            role: 'WK-BAT', ipl: 'RR' },
  { name: 'Riyan Parag',            role: 'ALL',    ipl: 'RR' },
  { name: 'Ravindra Jadeja',        role: 'ALL',    ipl: 'RR' },
  { name: 'Shubham Dubey',          role: 'ALL',    ipl: 'RR' },
  { name: 'Jofra Archer',           role: 'BOWL',   ipl: 'RR' },
  { name: 'Ravi Bishnoi',           role: 'BOWL',   ipl: 'RR' },
  { name: 'Sandeep Sharma',         role: 'BOWL',   ipl: 'RR' },
  { name: 'Vignesh Puthur',         role: 'BOWL',   ipl: 'RR' },
  // RCB
  { name: 'Virat Kohli',        role: 'BAT',    ipl: 'RCB' },
  { name: 'Rajat Patidar',      role: 'BAT',    ipl: 'RCB' },
  { name: 'Devdutt Padikkal',   role: 'BAT',    ipl: 'RCB' },
  { name: 'Phil Salt',          role: 'WK-BAT', ipl: 'RCB' },
  { name: 'Jitesh Sharma',      role: 'WK-BAT', ipl: 'RCB' },
  { name: 'Krunal Pandya',      role: 'ALL',    ipl: 'RCB' },
  { name: 'Tim David',          role: 'BAT',    ipl: 'RCB' },
  { name: 'Romario Shepherd',   role: 'ALL',    ipl: 'RCB' },
  { name: 'Jacob Bethell',      role: 'ALL',    ipl: 'RCB' },
  { name: 'Venkatesh Iyer',     role: 'ALL',    ipl: 'RCB' },
  { name: 'Josh Hazlewood',     role: 'BOWL',   ipl: 'RCB' },
  { name: 'Rasikh Dar',         role: 'BOWL',   ipl: 'RCB' },
  { name: 'Abhinandan Singh',   role: 'BOWL',   ipl: 'RCB' },
  { name: 'Suyash Sharma',      role: 'BOWL',   ipl: 'RCB' },
  { name: 'Bhuvneshwar Kumar',  role: 'BOWL',   ipl: 'RCB' },
  { name: 'Jacob Duffy',        role: 'BOWL',   ipl: 'RCB' },
  { name: 'Yash Dayal',         role: 'BOWL',   ipl: 'RCB' },
  { name: 'Akash Deep',         role: 'BOWL',   ipl: 'RCB' },
  // SRH
  { name: 'Ishan Kishan',           role: 'WK-BAT', ipl: 'SRH' },
  { name: 'Travis Head',            role: 'BAT',    ipl: 'SRH' },
  { name: 'Heinrich Klaasen',       role: 'WK-BAT', ipl: 'SRH' },
  { name: 'Abhishek Sharma',        role: 'BAT',    ipl: 'SRH' },
  { name: 'Aniket Verma',           role: 'BAT',    ipl: 'SRH' },
  { name: 'Smaran Ravichandran',    role: 'BAT',    ipl: 'SRH' },
  { name: 'Nitish Kumar Reddy',     role: 'ALL',    ipl: 'SRH' },
  { name: 'Harshal Patel',          role: 'BOWL',   ipl: 'SRH' },
  { name: 'Liam Livingstone',       role: 'ALL',    ipl: 'SRH' },
  { name: 'Pat Cummins',            role: 'ALL',    ipl: 'SRH' },
  { name: 'Jaydev Unadkat',         role: 'BOWL',   ipl: 'SRH' },
  { name: 'Zeeshan Ansari',         role: 'BOWL',   ipl: 'SRH' },
  { name: 'Eshan Malinga',          role: 'BOWL',   ipl: 'SRH' },
  { name: 'Harsh Dubey',            role: 'BOWL',   ipl: 'SRH' },
  { name: 'Shivang Kumar',          role: 'ALL',    ipl: 'SRH' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();
  console.log(`Seeding ${RAW_PLAYERS.length} IPL 2026 players…`);

  const rows = RAW_PLAYERS.map(p => {
    const pool = getPool(p.name);
    return {
      name: p.name,
      teamCode: p.ipl,
      role: ROLE_MAP[p.role] ?? 'BAT' as DbRole,
      sport: 'CRICKET_T20' as const,
      playerPool: pool,
      isOverseas: OVERSEAS.has(p.name),
      isUncapped: UNCAPPED.has(p.name),
      basePriceLakhs: getBasePrice(pool),
    };
  });

  // Upsert — skip existing by name to allow re-running safely
  const inserted = await db
    .insert(players)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: players.id, name: players.name });

  console.log(`✓ Inserted ${inserted.length} new players (${rows.length - inserted.length} already existed)`);

  // Print summary by pool
  const byPool = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.playerPool!] = (acc[r.playerPool!] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Pool breakdown:', byPool);

  const byTeam = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.teamCode!] = (acc[r.teamCode!] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Team breakdown:', byTeam);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
